import type { Express, Request, Response, NextFunction, RequestHandler } from "express";
import { createServer, type Server } from "http";
import { z } from "zod";
import bcrypt from "bcrypt";
import crypto from "crypto";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import cors from "cors";
import { storage } from "./storage";
import { config } from "./config";
import { securityHeaders, authSlowDown, authRateLimit, collectorRateLimit, logSecurityEvent, generateDeviceFingerprint, sanitizeRequest } from "./middleware/security";
import {
  ingestPayloadSchema,
  registerUserSchema,
  createServerSchema,
  updateServerSchema,
  ruleInputSchema,
  updateSettingsSchema,
  createUserSchema,
  updateUserSchema,
  type InsertGpuSnapshot,
} from "@shared/schema";
import { setupWebSocket } from "./websocket";
import { checkAlerts, forgetServer, sendAlertEmail, sendWebhook } from "./alerting";
import { events } from "./services/events";
import { getServerView, getServerViews, getFleetStats } from "./services/fleet";
import {
  authenticateApiKey,
  authenticateJWT,
  generateTokenPair,
  generateServerKey,
  refreshAccessToken,
  revokeRefreshToken,
  requireRole,
  verifyRefreshToken,
  type AuthenticatedRequest,
  type CollectorRequest,
} from "./auth";

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "3000", 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "development",
  keyGenerator: (req) => ipKeyGenerator(req.ip || "unknown"),
});

/** Wrap async handlers so rejections reach the error middleware. */
const h = (fn: (req: any, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

function validationError(res: Response, error: z.ZodError) {
  return res.status(400).json({
    message: error.errors.map((e) => `${e.path.join(".") || "input"}: ${e.message}`).join("; "),
    errors: error.errors,
  });
}

const whoami = (req: AuthenticatedRequest) => req.username || req.userId || "unknown";

function slugify(name: string): string {
  const slug = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
  return slug || "server";
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.set("trust proxy", process.env.TRUST_PROXY === "false" ? false : 1);
  app.use(securityHeaders);
  app.use(sanitizeRequest);
  app.use(cors({
    origin: config.isProduction ? process.env.FRONTEND_URL || false : true,
    credentials: true,
  }));
  app.use("/api", apiLimiter);

  // ------------------------------------------------------------------ health
  app.get("/health", async (_req, res) => {
    try {
      await storage.ping();
      res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "development",
      });
    } catch {
      res.status(503).json({ status: "ERROR", message: "Database connection failed", timestamp: new Date().toISOString() });
    }
  });

  // -------------------------------------------------------------------- auth
  app.post("/api/auth/login", authSlowDown, authRateLimit, h(async (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
      return res.status(400).json({ message: "Username and password required" });
    }

    const user = await storage.getUserByUsername(username);
    const valid = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !valid) {
      await logSecurityEvent({
        userId: user?.id,
        eventType: "failed_login",
        severity: "warning",
        ipAddress: req.ip,
        userAgent: req.get("User-Agent"),
        details: { username, reason: user ? "invalid_password" : "user_not_found" },
      });
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const deviceFingerprint = generateDeviceFingerprint(req);
    const { accessToken, refreshToken } = await generateTokenPair(user.id, user.role, deviceFingerprint, req.ip, req.get("User-Agent"), user.username);
    await logSecurityEvent({ userId: user.id, eventType: "login", ipAddress: req.ip, userAgent: req.get("User-Agent"), details: { username } });

    res.json({ token: accessToken, refreshToken, user: { id: user.id, username: user.username, role: user.role } });
  }));

  app.get("/api/auth/config", h(async (_req, res) => {
    const noUsers = (await storage.countUsers()) === 0;
    res.json({ registrationOpen: config.allowRegistration || noUsers });
  }));

  app.post("/api/auth/register", authSlowDown, authRateLimit, h(async (req, res) => {
    const noUsers = (await storage.countUsers()) === 0;
    if (!config.allowRegistration && !noUsers) {
      return res.status(403).json({ message: "Registration is disabled. Ask an administrator for an account." });
    }
    const parsed = registerUserSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    if (await storage.getUserByUsername(parsed.data.username)) {
      return res.status(409).json({ message: "Username already exists" });
    }
    const user = await storage.createUser({
      username: parsed.data.username,
      passwordHash: await bcrypt.hash(parsed.data.password, config.bcryptRounds),
      // The very first account administers the instance
      role: noUsers ? "admin" : "viewer",
    });

    const { accessToken, refreshToken } = await generateTokenPair(user.id, user.role, generateDeviceFingerprint(req), req.ip, req.get("User-Agent"), user.username);
    await logSecurityEvent({ userId: user.id, eventType: "register", ipAddress: req.ip, userAgent: req.get("User-Agent"), details: { username: user.username } });

    res.status(201).json({ token: accessToken, refreshToken, user: { id: user.id, username: user.username, role: user.role } });
  }));

  app.post("/api/auth/refresh", h(async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken !== "string" || !refreshToken) {
      return res.status(400).json({ message: "Refresh token required" });
    }
    const result = await refreshAccessToken(refreshToken);
    if (!result) {
      await logSecurityEvent({ eventType: "token_refresh_failed", severity: "warning", ipAddress: req.ip, userAgent: req.get("User-Agent") });
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }
    const user = await storage.getUser(result.userId);
    res.json({ token: result.token, user: user && { id: user.id, username: user.username, role: user.role } });
  }));

  app.post("/api/auth/logout", h(async (req, res) => {
    const { refreshToken } = req.body ?? {};
    if (typeof refreshToken === "string" && refreshToken) {
      const decoded = verifyRefreshToken(refreshToken);
      await revokeRefreshToken(refreshToken);
      await logSecurityEvent({ userId: decoded?.userId, eventType: "logout", ipAddress: req.ip, userAgent: req.get("User-Agent") });
    }
    res.json({ message: "Logged out successfully" });
  }));

  app.get("/api/auth/me", authenticateJWT, h(async (req: AuthenticatedRequest, res) => {
    const user = await storage.getUser(req.userId!);
    if (!user) return res.status(401).json({ message: "User not found" });
    res.json({ id: user.id, username: user.username, role: user.role });
  }));

  app.post("/api/auth/change-password", authenticateJWT, h(async (req: AuthenticatedRequest, res) => {
    const schema = z.object({ currentPassword: z.string(), newPassword: z.string().min(8) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const user = await storage.getUser(req.userId!);
    if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
      return res.status(400).json({ message: "Current password is incorrect" });
    }
    await storage.updateUser(user.id, { passwordHash: await bcrypt.hash(parsed.data.newPassword, config.bcryptRounds) });
    await logSecurityEvent({ userId: user.id, eventType: "password_change", ipAddress: req.ip });
    res.json({ status: "OK" });
  }));

  // ---------------------------------------------------------------- ingest
  app.post("/v1/ingest", collectorRateLimit, authenticateApiKey, h(async (req: CollectorRequest, res) => {
    const parsed = ingestPayloadSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const payload = parsed.data;

    // A per-server key pins the payload to its server, whatever id the collector sends
    let serverId = payload.server.id;
    if (req.collectorServer) {
      serverId = req.collectorServer.id;
    } else {
      const existing = await storage.getServer(serverId);
      if (existing?.apiKeyHash) {
        return res.status(403).json({ message: "This server has its own API key; the global key is not accepted for it" });
      }
    }

    const server = await storage.upsertServerFromIngest(
      { id: serverId, name: payload.server.name, tags: payload.server.tags ?? [], ip: req.ip ?? null },
      payload.host,
    );

    const s = payload.sys;
    const opt = (v: number | undefined) => (v === undefined ? null : v.toString());
    await storage.insertSnapshots(
      {
        serverId,
        cpuPercent: s.cpuPercent.toString(),
        ramPercent: s.ramPercent.toString(),
        diskPercent: s.diskPercent.toString(),
        load1: s.load1.toString(),
        load5: opt(s.load5),
        load15: opt(s.load15),
        ramUsedMB: s.ramUsedMB === undefined ? null : Math.round(s.ramUsedMB),
        ramTotalMB: s.ramTotalMB === undefined ? null : Math.round(s.ramTotalMB),
        diskUsedGB: opt(s.diskUsedGB),
        diskTotalGB: opt(s.diskTotalGB),
        netRxBps: s.netRxBps === undefined ? null : Math.round(s.netRxBps),
        netTxBps: s.netTxBps === undefined ? null : Math.round(s.netTxBps),
        uptimeSec: Math.round(s.uptimeSec),
      },
      payload.gpus.map((gpu): InsertGpuSnapshot => ({
        serverId,
        gpuIndex: gpu.gpuIndex,
        vendor: gpu.vendor,
        name: gpu.name ?? null,
        uuid: gpu.uuid ?? null,
        utilPercent: gpu.utilPercent.toString(),
        vramUsedMB: Math.round(gpu.vramUsedMB),
        vramTotalMB: Math.round(gpu.vramTotalMB),
        tempC: gpu.tempC.toString(),
        powerW: gpu.powerW.toString(),
        fanPercent: gpu.fanPercent.toString(),
        driverVersion: gpu.driverVersion,
      })),
    );

    await checkAlerts(server, { sys: s, gpus: payload.gpus });
    events.emitEvent({ type: "metrics", serverId });

    const settings = await storage.getSettings();
    res.json({ status: "OK", serverId, timestamp: new Date().toISOString(), offlineAfterSec: Number(settings.offline_after_sec) });
  }));

  // --------------------------------------------------------------- servers
  app.get("/api/servers", authenticateJWT, h(async (_req, res) => {
    res.json(await getServerViews());
  }));

  app.get("/api/tags", authenticateJWT, h(async (_req, res) => {
    const tags = new Set<string>();
    for (const s of await storage.listServers()) (s.tags ?? []).forEach((t) => tags.add(t));
    res.json(Array.from(tags).sort());
  }));

  app.post("/api/servers", authenticateJWT, requireRole("admin"), h(async (req: AuthenticatedRequest, res) => {
    const parsed = createServerSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const data = parsed.data;

    let id = data.id || slugify(data.name);
    if (await storage.getServer(id)) {
      if (data.id) return res.status(409).json({ message: `Server id "${id}" already exists` });
      id = `${id}-${crypto.randomBytes(2).toString("hex")}`;
    }

    const key = generateServerKey();
    const server = await storage.createServer({
      id,
      name: data.name,
      tags: data.tags,
      description: data.description ?? null,
      location: data.location ?? null,
      apiKeyHash: key.hash,
      apiKeyPrefix: key.prefix,
    });
    await logSecurityEvent({ userId: req.userId, eventType: "server_created", ipAddress: req.ip, details: { serverId: id } });
    events.emitEvent({ type: "servers" });

    // The plain key is only ever returned here and on rotation
    res.status(201).json({ server: await getServerView(server.id), apiKey: key.key });
  }));

  app.get("/api/servers/:id", authenticateJWT, h(async (req, res) => {
    const view = await getServerView(req.params.id);
    if (!view) return res.status(404).json({ message: "Server not found" });
    res.json(view);
  }));

  app.patch("/api/servers/:id", authenticateJWT, requireRole("admin"), h(async (req: AuthenticatedRequest, res) => {
    const parsed = updateServerSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const updated = await storage.updateServer(req.params.id, parsed.data);
    if (!updated) return res.status(404).json({ message: "Server not found" });
    if (parsed.data.maintenance) {
      forgetServer(updated.id);
      await storage.resolveAlertsForServer(updated.id, "maintenance");
    }
    events.emitEvent({ type: "servers" });
    res.json(await getServerView(updated.id));
  }));

  app.delete("/api/servers/:id", authenticateJWT, requireRole("admin"), h(async (req: AuthenticatedRequest, res) => {
    const server = await storage.getServer(req.params.id);
    if (!server) return res.status(404).json({ message: "Server not found" });
    await storage.deleteServer(server.id);
    forgetServer(server.id);
    await logSecurityEvent({ userId: req.userId, eventType: "server_deleted", ipAddress: req.ip, details: { serverId: server.id } });
    events.emitEvent({ type: "servers" });
    res.status(204).send();
  }));

  app.post("/api/servers/:id/rotate-key", authenticateJWT, requireRole("admin"), h(async (req: AuthenticatedRequest, res) => {
    const server = await storage.getServer(req.params.id);
    if (!server) return res.status(404).json({ message: "Server not found" });
    const key = generateServerKey();
    await storage.updateServer(server.id, { apiKeyHash: key.hash, apiKeyPrefix: key.prefix });
    await logSecurityEvent({ userId: req.userId, eventType: "server_key_rotated", severity: "warning", ipAddress: req.ip, details: { serverId: server.id } });
    res.json({ apiKey: key.key, server: await getServerView(server.id) });
  }));

  const hoursSchema = z.coerce.number().min(0.25).max(24 * 90).default(1);

  app.get("/api/servers/:id/metrics", authenticateJWT, h(async (req, res) => {
    const hours = hoursSchema.safeParse(req.query.hours);
    if (!hours.success) return validationError(res, hours.error);
    res.json(await storage.getServerMetrics(req.params.id, hours.data));
  }));

  app.get("/api/servers/:id/export.csv", authenticateJWT, h(async (req, res) => {
    const hours = hoursSchema.safeParse(req.query.hours ?? 24);
    if (!hours.success) return validationError(res, hours.error);
    const { sys, gpus } = await storage.exportServerMetrics(req.params.id, hours.data);
    const lines = ["kind,ts,gpu_index,gpu_name,util_percent,vram_used_mb,vram_total_mb,temp_c,power_w,fan_percent,cpu_percent,ram_percent,disk_percent,load1"];
    for (const s of sys) {
      lines.push(["system", s.ts, "", "", "", "", "", "", "", "", s.cpuPercent, s.ramPercent, s.diskPercent, s.load1].map(csvEscape).join(","));
    }
    for (const g of gpus) {
      lines.push(["gpu", g.ts, g.gpuIndex, g.name, g.utilPercent, g.vramUsedMB, g.vramTotalMB, g.tempC, g.powerW, g.fanPercent, "", "", "", ""].map(csvEscape).join(","));
    }
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${req.params.id.replace(/[^\w.-]/g, "_")}-metrics.csv"`);
    res.send(lines.join("\n"));
  }));

  // ---------------------------------------------------------------- alerts
  app.get("/api/alerts", authenticateJWT, h(async (req, res) => {
    const schema = z.object({
      status: z.enum(["active", "resolved", "all"]).default("all"),
      serverId: z.string().optional(),
      limit: z.coerce.number().int().min(1).max(2000).optional(),
      // legacy ?resolved=true|false
      resolved: z.enum(["true", "false"]).optional(),
    });
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const q = parsed.data;
    const status = q.resolved ? (q.resolved === "true" ? "resolved" : "active") : q.status;
    res.json(await storage.getAlerts({ status, serverId: q.serverId, limit: q.limit }));
  }));

  app.patch("/api/alerts/:id/resolve", authenticateJWT, requireRole("admin"), h(async (req: AuthenticatedRequest, res) => {
    const alert = await storage.resolveAlert(req.params.id, whoami(req));
    if (alert) {
      events.emitEvent({ type: "alert", action: "resolved", alertId: alert.id, serverId: alert.serverId, level: alert.level, message: alert.message });
    }
    res.json({ status: "OK" });
  }));

  app.patch("/api/alerts/:id/acknowledge", authenticateJWT, h(async (req: AuthenticatedRequest, res) => {
    const alert = await storage.acknowledgeAlert(req.params.id, whoami(req));
    if (alert) {
      events.emitEvent({ type: "alert", action: "acknowledged", alertId: alert.id, serverId: alert.serverId, level: alert.level, message: alert.message });
    }
    res.json({ status: "OK" });
  }));

  // ----------------------------------------------------------------- rules
  app.get("/api/rules", authenticateJWT, h(async (_req, res) => {
    res.json(await storage.getRules());
  }));

  const toRuleRow = (data: Partial<z.infer<typeof ruleInputSchema>>) => ({
    ...data,
    threshold: data.threshold === undefined ? undefined : data.threshold.toString(),
    serverId: data.serverId === undefined ? undefined : data.serverId || null,
    tag: data.tag === undefined ? undefined : data.tag || null,
  });

  app.post("/api/rules", authenticateJWT, requireRole("admin"), h(async (req, res) => {
    const parsed = ruleInputSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const row = toRuleRow(parsed.data);
    res.status(201).json(await storage.createRule({ ...parsed.data, ...row, threshold: row.threshold! }));
  }));

  app.patch("/api/rules/:id", authenticateJWT, requireRole("admin"), h(async (req, res) => {
    const parsed = ruleInputSchema.partial().safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const row = Object.fromEntries(Object.entries(toRuleRow(parsed.data)).filter(([, v]) => v !== undefined));
    const rule = await storage.updateRule(req.params.id, row);
    if (!rule) return res.status(404).json({ message: "Rule not found" });
    res.json(rule);
  }));

  app.delete("/api/rules/:id", authenticateJWT, requireRole("admin"), h(async (req, res) => {
    await storage.deleteRule(req.params.id);
    res.status(204).send();
  }));

  // -------------------------------------------------------------- settings
  app.get("/api/settings", authenticateJWT, h(async (req: AuthenticatedRequest, res) => {
    const settings = await storage.getSettings();
    // A webhook URL is a credential: only admins see it
    if (req.userRole !== "admin" && settings.webhook_url) settings.webhook_url = "••••••";
    res.json({
      ...settings,
      _server: {
        emailConfigured: !!process.env.SENDGRID_API_KEY,
        globalKeyEnabled: !!config.collectorApiKey && !config.requireServerKeys,
      },
    });
  }));

  app.patch("/api/settings", authenticateJWT, requireRole("admin"), h(async (req: AuthenticatedRequest, res) => {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    await storage.updateSettings(parsed.data);
    await logSecurityEvent({ userId: req.userId, eventType: "settings_changed", ipAddress: req.ip, details: { keys: Object.keys(parsed.data) } });
    events.emitEvent({ type: "servers" });
    res.json({ status: "OK" });
  }));

  const testNotification = {
    kind: "test" as const,
    alert: { level: "warning", message: "This is a test notification from GPU Monitor", value: null, firedAt: new Date() },
    rule: { name: "Test rule", threshold: "0" },
    serverName: "test-server",
  };

  app.post("/api/settings/test-webhook", authenticateJWT, requireRole("admin"), h(async (req, res) => {
    const url = z.string().url().safeParse(req.body?.url || (await storage.getSettings()).webhook_url);
    if (!url.success || !/^https?:\/\//.test(url.data)) return res.status(400).json({ message: "A valid http(s) webhook URL is required" });
    try {
      await sendWebhook(url.data, testNotification);
      res.json({ status: "OK" });
    } catch (error: any) {
      res.status(502).json({ message: error.message || "Webhook failed" });
    }
  }));

  app.post("/api/settings/test-email", authenticateJWT, requireRole("admin"), h(async (req, res) => {
    const to = z.string().email().safeParse(req.body?.to || (await storage.getSettings()).alert_email_to);
    if (!to.success) return res.status(400).json({ message: "A valid email address is required" });
    try {
      await sendAlertEmail(to.data, testNotification);
      res.json({ status: "OK" });
    } catch (error: any) {
      res.status(502).json({ message: error.message || "Email failed" });
    }
  }));

  // ----------------------------------------------------------------- users
  app.get("/api/users", authenticateJWT, requireRole("admin"), h(async (_req, res) => {
    res.json(await storage.listUsers());
  }));

  app.post("/api/users", authenticateJWT, requireRole("admin"), h(async (req: AuthenticatedRequest, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    if (await storage.getUserByUsername(parsed.data.username)) {
      return res.status(409).json({ message: "Username already exists" });
    }
    const user = await storage.createUser({
      username: parsed.data.username,
      passwordHash: await bcrypt.hash(parsed.data.password, config.bcryptRounds),
      role: parsed.data.role,
    });
    await logSecurityEvent({ userId: req.userId, eventType: "user_created", ipAddress: req.ip, details: { username: user.username, role: user.role } });
    res.status(201).json({ id: user.id, username: user.username, role: user.role, createdAt: user.createdAt });
  }));

  app.patch("/api/users/:id", authenticateJWT, requireRole("admin"), h(async (req: AuthenticatedRequest, res) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const target = await storage.getUser(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (parsed.data.role && parsed.data.role !== "admin" && target.role === "admin" && (await storage.countUsers("admin")) <= 1) {
      return res.status(400).json({ message: "Cannot demote the last administrator" });
    }
    const updates: { role?: string; passwordHash?: string } = {};
    if (parsed.data.role) updates.role = parsed.data.role;
    if (parsed.data.password) updates.passwordHash = await bcrypt.hash(parsed.data.password, config.bcryptRounds);
    const user = await storage.updateUser(target.id, updates);
    if (parsed.data.password) await storage.revokeUserTokens(target.id);
    await logSecurityEvent({ userId: req.userId, eventType: "user_updated", severity: parsed.data.role ? "warning" : "info", ipAddress: req.ip, details: { username: target.username, role: parsed.data.role, passwordReset: !!parsed.data.password } });
    res.json({ id: user!.id, username: user!.username, role: user!.role, createdAt: user!.createdAt });
  }));

  app.delete("/api/users/:id", authenticateJWT, requireRole("admin"), h(async (req: AuthenticatedRequest, res) => {
    const target = await storage.getUser(req.params.id);
    if (!target) return res.status(404).json({ message: "User not found" });
    if (target.id === req.userId) return res.status(400).json({ message: "You cannot delete your own account" });
    if (target.role === "admin" && (await storage.countUsers("admin")) <= 1) {
      return res.status(400).json({ message: "Cannot delete the last administrator" });
    }
    await storage.deleteUser(target.id);
    await logSecurityEvent({ userId: req.userId, eventType: "user_deleted", severity: "warning", ipAddress: req.ip, details: { username: target.username } });
    res.status(204).send();
  }));

  app.get("/api/audit-log", authenticateJWT, requireRole("admin"), h(async (req, res) => {
    const limit = z.coerce.number().int().min(1).max(1000).default(200).safeParse(req.query.limit);
    res.json(await storage.getSecurityAuditLog(limit.success ? limit.data : 200));
  }));

  // ----------------------------------------------------------------- stats
  app.get("/api/stats", authenticateJWT, h(async (_req, res) => {
    const stats = await getFleetStats();
    // totalPowerConsumption kept for older clients
    res.json({ ...stats, totalPowerConsumption: stats.totalPowerKW });
  }));

  // Unknown API routes should not fall through to the SPA
  app.use(["/api", "/v1"], (_req: Request, res: Response) => {
    res.status(404).json({ message: "Not found" });
  });

  const httpServer = createServer(app);
  setupWebSocket(httpServer);
  return httpServer;
}
