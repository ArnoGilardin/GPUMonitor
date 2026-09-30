import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean, jsonb, index, bigint } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const servers = pgTable("servers", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  ip: text("ip"),
  description: text("description"),
  location: text("location"),
  // SHA-256 of the per-server collector key; null means the server reports with the global key
  apiKeyHash: text("api_key_hash"),
  apiKeyPrefix: text("api_key_prefix"),
  maintenance: boolean("maintenance").default(false).notNull(),
  hostname: text("hostname"),
  os: text("os"),
  cpuModel: text("cpu_model"),
  cpuCores: integer("cpu_cores"),
  collectorVersion: text("collector_version"),
  // null until the first ingest: servers created from the UI start as "pending"
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gpuSnapshots = pgTable("gpu_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  gpuIndex: integer("gpu_index").notNull(),
  vendor: text("vendor").notNull(), // "nvidia" | "amd"
  name: text("name"),
  uuid: text("uuid"),
  utilPercent: decimal("util_percent", { precision: 5, scale: 2 }),
  vramUsedMB: integer("vram_used_mb"),
  vramTotalMB: integer("vram_total_mb"),
  tempC: decimal("temp_c", { precision: 5, scale: 2 }),
  powerW: decimal("power_w", { precision: 7, scale: 2 }),
  fanPercent: decimal("fan_percent", { precision: 5, scale: 2 }),
  driverVersion: text("driver_version"),
  ts: timestamp("ts").defaultNow().notNull(),
}, (t) => [index("gpu_snapshots_server_ts_idx").on(t.serverId, t.ts)]);

export const sysSnapshots = pgTable("sys_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  cpuPercent: decimal("cpu_percent", { precision: 5, scale: 2 }),
  ramPercent: decimal("ram_percent", { precision: 5, scale: 2 }),
  diskPercent: decimal("disk_percent", { precision: 5, scale: 2 }),
  load1: decimal("load1", { precision: 7, scale: 2 }),
  load5: decimal("load5", { precision: 7, scale: 2 }),
  load15: decimal("load15", { precision: 7, scale: 2 }),
  ramUsedMB: integer("ram_used_mb"),
  ramTotalMB: integer("ram_total_mb"),
  diskUsedGB: decimal("disk_used_gb", { precision: 10, scale: 2 }),
  diskTotalGB: decimal("disk_total_gb", { precision: 10, scale: 2 }),
  netRxBps: bigint("net_rx_bps", { mode: "number" }),
  netTxBps: bigint("net_tx_bps", { mode: "number" }),
  uptimeSec: integer("uptime_sec"),
  ts: timestamp("ts").defaultNow().notNull(),
}, (t) => [index("sys_snapshots_server_ts_idx").on(t.serverId, t.ts)]);

export const rules = pgTable("rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // see RULE_TYPES
  threshold: decimal("threshold", { precision: 7, scale: 2 }).notNull(),
  durationSec: integer("duration_sec").notNull(),
  level: text("level").notNull(), // "warning" | "critical"
  enabled: boolean("enabled").default(true),
  // Optional scope: when both are empty the rule applies to every server
  serverId: varchar("server_id").references(() => servers.id, { onDelete: "cascade" }),
  tag: text("tag"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  ruleId: varchar("rule_id").notNull().references(() => rules.id, { onDelete: "cascade" }),
  level: text("level").notNull(), // "warning" | "critical"
  message: text("message").notNull(),
  value: decimal("value", { precision: 10, scale: 2 }),
  firedAt: timestamp("fired_at").defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: text("acknowledged_by"),
  resolvedAt: timestamp("resolved_at"),
  // "auto" when the condition cleared, otherwise the username who resolved it
  resolvedBy: text("resolved_by"),
}, (t) => [index("alerts_server_rule_idx").on(t.serverId, t.ruleId)]);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("viewer"), // "admin" | "viewer"
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Security tables for hardened authentication
export const refreshTokens = pgTable("refresh_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  token: text("token").notNull().unique(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  deviceFingerprint: text("device_fingerprint"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
});

export const securityAuditLog = pgTable("security_audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: "set null" }),
  eventType: text("event_type").notNull(), // "login", "logout", "token_refresh", "failed_login", "role_change", "api_key_used"
  severity: text("severity").notNull().default("info"), // "info", "warning", "critical"
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  details: jsonb("details"), // Additional event-specific data
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Relations
export const serversRelations = relations(servers, ({ many }) => ({
  gpuSnapshots: many(gpuSnapshots),
  sysSnapshots: many(sysSnapshots),
  alerts: many(alerts),
}));

export const gpuSnapshotsRelations = relations(gpuSnapshots, ({ one }) => ({
  server: one(servers, {
    fields: [gpuSnapshots.serverId],
    references: [servers.id],
  }),
}));

export const sysSnapshotsRelations = relations(sysSnapshots, ({ one }) => ({
  server: one(servers, {
    fields: [sysSnapshots.serverId],
    references: [servers.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one }) => ({
  server: one(servers, {
    fields: [alerts.serverId],
    references: [servers.id],
  }),
  rule: one(rules, {
    fields: [alerts.ruleId],
    references: [rules.id],
  }),
}));

// Insert schemas
export const insertServerSchema = createInsertSchema(servers).omit({
  createdAt: true,
  lastSeenAt: true,
});

export const RULE_TYPES = [
  "gpu_temp",
  "gpu_util",
  "vram_util",
  "gpu_power",
  "cpu_util",
  "ram_util",
  "disk_util",
  "load1",
  "server_offline",
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export const RULE_TYPE_LABELS: Record<RuleType, { label: string; unit: string }> = {
  gpu_temp: { label: "GPU temperature (max)", unit: "°C" },
  gpu_util: { label: "GPU utilization (avg)", unit: "%" },
  vram_util: { label: "VRAM usage (max)", unit: "%" },
  gpu_power: { label: "GPU power (total)", unit: "W" },
  cpu_util: { label: "CPU utilization", unit: "%" },
  ram_util: { label: "RAM usage", unit: "%" },
  disk_util: { label: "Disk usage", unit: "%" },
  load1: { label: "Load average (1m)", unit: "" },
  server_offline: { label: "Server offline", unit: "s" },
};

const serverIdPattern = /^[A-Za-z0-9._-]{1,64}$/;

// Admin-facing server creation / update
export const createServerSchema = z.object({
  id: z.string().regex(serverIdPattern, "Letters, digits, '.', '_' and '-' only (max 64)").optional(),
  name: z.string().trim().min(1).max(100),
  tags: z.array(z.string().trim().min(1).max(32)).max(20).default([]),
  description: z.string().max(500).optional().nullable(),
  location: z.string().max(100).optional().nullable(),
});

export const updateServerSchema = createServerSchema.omit({ id: true }).partial().extend({
  maintenance: z.boolean().optional(),
});

export const ruleInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  type: z.enum(RULE_TYPES),
  threshold: z.coerce.number().finite(),
  durationSec: z.coerce.number().int().min(0).max(86400),
  level: z.enum(["warning", "critical"]),
  enabled: z.boolean().default(true),
  serverId: z.string().optional().nullable(),
  tag: z.string().optional().nullable(),
});

export const SETTING_KEYS = [
  "alert_email_to",
  "webhook_url",
  "offline_after_sec",
  "metrics_retention_days",
  "alerts_retention_days",
  "notify_on_resolve",
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const SETTING_DEFAULTS: Record<SettingKey, string> = {
  alert_email_to: "",
  webhook_url: "",
  offline_after_sec: "120",
  metrics_retention_days: "30",
  alerts_retention_days: "90",
  notify_on_resolve: "true",
};

export const updateSettingsSchema = z.object({
  alert_email_to: z.union([z.string().email(), z.literal("")]).optional(),
  webhook_url: z.union([z.string().url().refine((u) => /^https?:\/\//.test(u), "http(s) only"), z.literal("")]).optional(),
  offline_after_sec: z.coerce.number().int().min(30).max(86400).transform(String).optional(),
  metrics_retention_days: z.coerce.number().int().min(1).max(3650).transform(String).optional(),
  alerts_retention_days: z.coerce.number().int().min(1).max(3650).transform(String).optional(),
  notify_on_resolve: z.union([z.boolean(), z.enum(["true", "false"])]).transform(String).optional(),
});

export const insertGpuSnapshotSchema = createInsertSchema(gpuSnapshots).omit({
  id: true,
  ts: true,
});

export const insertSysSnapshotSchema = createInsertSchema(sysSnapshots).omit({
  id: true,
  ts: true,
});

export const insertRuleSchema = createInsertSchema(rules).omit({
  id: true,
  createdAt: true,
});

export const insertAlertSchema = createInsertSchema(alerts).omit({
  id: true,
  firedAt: true,
});

// Security schema additions
export const insertRefreshTokenSchema = createInsertSchema(refreshTokens).omit({
  id: true,
  createdAt: true,
});

export const insertSecurityAuditLogSchema = createInsertSchema(securityAuditLog).omit({
  id: true,
  timestamp: true,
});

// Security table relations
export const refreshTokensRelations = relations(refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const securityAuditLogRelations = relations(securityAuditLog, ({ one }) => ({
  user: one(users, {
    fields: [securityAuditLog.userId],
    references: [users.id],
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  securityAuditLog: many(securityAuditLog),
}));

export const insertSettingSchema = createInsertSchema(settings).omit({
  updatedAt: true,
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

// Registration schema for new users (with plain password)
export const registerUserSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const USER_ROLES = ["admin", "viewer"] as const;

export const createUserSchema = registerUserSchema.extend({
  role: z.enum(USER_ROLES).default("viewer"),
});

export const updateUserSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  password: z.string().min(8).optional(),
});

// Types
export type Server = typeof servers.$inferSelect;
export type InsertServer = z.infer<typeof insertServerSchema>;
export type GpuSnapshot = typeof gpuSnapshots.$inferSelect;
export type InsertGpuSnapshot = z.infer<typeof insertGpuSnapshotSchema>;
export type SysSnapshot = typeof sysSnapshots.$inferSelect;
export type InsertSysSnapshot = z.infer<typeof insertSysSnapshotSchema>;
export type Rule = typeof rules.$inferSelect;
export type InsertRule = z.infer<typeof insertRuleSchema>;
export type Alert = typeof alerts.$inferSelect;
export type InsertAlert = z.infer<typeof insertAlertSchema>;
export type Setting = typeof settings.$inferSelect;
export type InsertSetting = z.infer<typeof insertSettingSchema>;
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type InsertRefreshToken = z.infer<typeof insertRefreshTokenSchema>;
export type SecurityAuditLog = typeof securityAuditLog.$inferSelect;
export type InsertSecurityAuditLog = z.infer<typeof insertSecurityAuditLogSchema>;

// Ingest payload schema. New fields are optional so older collectors keep working.
const num = z.number().finite();
export const ingestPayloadSchema = z.object({
  server: z.object({
    id: z.string().regex(serverIdPattern),
    name: z.string().min(1).max(100),
    tags: z.array(z.string()).optional(),
  }),
  host: z.object({
    hostname: z.string().max(255).optional(),
    os: z.string().max(255).optional(),
    cpuModel: z.string().max(255).optional(),
    cpuCores: z.number().int().optional(),
    collectorVersion: z.string().max(32).optional(),
  }).optional(),
  sys: z.object({
    cpuPercent: num,
    ramPercent: num,
    diskPercent: num,
    load1: num,
    load5: num.optional(),
    load15: num.optional(),
    ramUsedMB: num.optional(),
    ramTotalMB: num.optional(),
    diskUsedGB: num.optional(),
    diskTotalGB: num.optional(),
    netRxBps: num.optional(),
    netTxBps: num.optional(),
    uptimeSec: num,
  }),
  gpus: z.array(z.object({
    gpuIndex: z.number().int(),
    vendor: z.enum(["nvidia", "amd"]),
    name: z.string().max(255).optional(),
    uuid: z.string().max(255).optional(),
    utilPercent: num,
    vramUsedMB: num,
    vramTotalMB: num,
    tempC: num,
    powerW: num,
    fanPercent: num,
    driverVersion: z.string(),
  })).max(64),
  ts: z.string(),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;

// Shapes returned by the API (shared with the client)
export type ServerStatus = "online" | "warning" | "error" | "offline" | "pending" | "maintenance";

export interface GpuView {
  gpuIndex: number;
  vendor: string;
  name: string;
  uuid: string | null;
  utilPercent: number;
  vramUsedMB: number;
  vramTotalMB: number;
  tempC: number;
  powerW: number;
  fanPercent: number;
  driverVersion: string | null;
}

export interface ServerView {
  id: string;
  name: string;
  tags: string[];
  ip: string | null;
  description: string | null;
  location: string | null;
  maintenance: boolean;
  hasOwnKey: boolean;
  apiKeyPrefix: string | null;
  hostname: string | null;
  os: string | null;
  cpuModel: string | null;
  cpuCores: number | null;
  collectorVersion: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  status: ServerStatus;
  activeAlerts: number;
  cpuPercent: number | null;
  ramPercent: number | null;
  diskPercent: number | null;
  load1: number | null;
  uptimeSec: number | null;
  gpuUtil: number | null;
  gpuCount: number;
  totalPowerW: number;
  maxGpuTempC: number | null;
  gpus: GpuView[];
}

export interface FleetStats {
  totalServers: number;
  onlineServers: number;
  offlineServers: number;
  totalGpus: number;
  avgGpuUtil: number;
  totalPowerKW: number;
  activeAlerts: number;
  criticalAlerts: number;
  resolvedToday: number;
  totalVramUsedGB: number;
  totalVramGB: number;
}
