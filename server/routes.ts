import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { z } from "zod";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { storage } from "./storage";
import { ingestPayloadSchema, registerUserSchema } from "@shared/schema";
import { setupWebSocket } from "./websocket.ts";
import { checkAlerts } from "./alerting.ts";
import { authenticateApiKey, authenticateJWT, generateTokenPair, refreshAccessToken, revokeRefreshToken, requireRole } from "./auth.ts";

const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key";

// Rate limiting - More permissive in development
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "development" ? 1000 : 100, // Higher limit for dev
  skip: (req) => process.env.NODE_ENV === "development" && req.path.startsWith("/api/auth"), // Skip auth endpoints in dev
});

const ingestLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // allow more frequent requests from collectors
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Trust proxy for accurate rate limiting in hosted environments
  app.set('trust proxy', 1);

  // CORS setup
  app.use(cors({
    origin: process.env.NODE_ENV === "production" 
      ? process.env.FRONTEND_URL || false
      : true,
    credentials: true,
  }));

  // Apply rate limiting
  app.use(limiter);

  // Health check
  app.get("/health", async (req, res) => {
    try {
      // Test database connection
      await storage.getSettings();
      res.json({ 
        status: "OK", 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || "development"
      });
    } catch (error) {
      res.status(503).json({ 
        status: "ERROR", 
        message: "Database connection failed",
        timestamp: new Date().toISOString()
      });
    }
  });

  // Authentication routes
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const { accessToken, refreshToken } = generateTokenPair(user.id, user.role);
      res.json({ 
        token: accessToken,
        refreshToken,
        user: { id: user.id, username: user.username, role: user.role } 
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/auth/register", async (req, res) => {
    try {
      const userData = registerUserSchema.parse(req.body);
      
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return res.status(409).json({ message: "Username already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);
      
      const user = await storage.createUser({
        username: userData.username,
        passwordHash: hashedPassword,
        role: "viewer", // Default role for new registrations
      });

      const { accessToken, refreshToken } = generateTokenPair(user.id, user.role);
      res.status(201).json({ 
        token: accessToken,
        refreshToken,
        user: { id: user.id, username: user.username, role: user.role } 
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid input", errors: error.errors });
      }
      console.error("Registration error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Refresh token endpoint
  app.post("/api/auth/refresh", async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({ message: "Refresh token required" });
      }

      // Get user from refresh token to fetch current role
      const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET || "development-refresh-secret") as { userId: string };
      const user = await storage.getUser(decoded.userId);
      
      if (!user) {
        return res.status(401).json({ message: "User not found" });
      }

      const newAccessToken = refreshAccessToken(refreshToken, user.role);
      
      if (!newAccessToken) {
        return res.status(401).json({ message: "Invalid or expired refresh token" });
      }

      res.json({ token: newAccessToken });
    } catch (error) {
      console.error("Token refresh error:", error);
      res.status(401).json({ message: "Invalid refresh token" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", async (req, res) => {
    try {
      const { refreshToken } = req.body;
      
      if (refreshToken) {
        revokeRefreshToken(refreshToken);
      }
      
      res.json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // Data ingestion endpoint (for collectors)
  app.post("/v1/ingest", ingestLimiter, authenticateApiKey, async (req, res) => {
    try {
      const payload = ingestPayloadSchema.parse(req.body);
      
      // Upsert server
      await storage.upsertServer({
        id: payload.server.id,
        name: payload.server.name,
        tags: payload.server.tags || [],
        ip: req.ip,
      });

      // Insert system snapshot
      await storage.insertSysSnapshot({
        serverId: payload.server.id,
        cpuPercent: payload.sys.cpuPercent.toString(),
        ramPercent: payload.sys.ramPercent.toString(),
        diskPercent: payload.sys.diskPercent.toString(),
        load1: payload.sys.load1.toString(),
        uptimeSec: payload.sys.uptimeSec,
      });

      // Insert GPU snapshots
      for (const gpu of payload.gpus) {
        await storage.insertGpuSnapshot({
          serverId: payload.server.id,
          gpuIndex: gpu.gpuIndex,
          vendor: gpu.vendor,
          utilPercent: gpu.utilPercent.toString(),
          vramUsedMB: gpu.vramUsedMB,
          vramTotalMB: gpu.vramTotalMB,
          tempC: gpu.tempC.toString(),
          powerW: gpu.powerW.toString(),
          fanPercent: gpu.fanPercent.toString(),
          driverVersion: gpu.driverVersion,
        });
      }

      // Check for alerts
      await checkAlerts(payload.server.id);

      res.json({ status: "OK", timestamp: new Date().toISOString() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid payload", errors: error.errors });
      }
      console.error("Ingestion error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // API routes (protected with JWT)
  app.get("/api/servers", authenticateJWT, async (req, res) => {
    try {
      const servers = await storage.getServersWithMetrics();
      res.json(servers);
    } catch (error) {
      console.error("Get servers error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/servers/:id", authenticateJWT, async (req, res) => {
    try {
      const server = await storage.getServerWithDetails(req.params.id);
      if (!server) {
        return res.status(404).json({ message: "Server not found" });
      }
      res.json(server);
    } catch (error) {
      console.error("Get server details error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/servers/:id/metrics", authenticateJWT, async (req, res) => {
    try {
      const { hours = "1" } = req.query;
      const metrics = await storage.getServerMetrics(req.params.id, parseInt(hours as string));
      res.json(metrics);
    } catch (error) {
      console.error("Get server metrics error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/alerts", authenticateJWT, async (req, res) => {
    try {
      const { resolved } = req.query;
      const alerts = await storage.getAlerts(resolved === "true");
      res.json(alerts);
    } catch (error) {
      console.error("Get alerts error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/alerts/:id/resolve", authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      await storage.resolveAlert(req.params.id);
      res.json({ status: "OK" });
    } catch (error) {
      console.error("Resolve alert error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/rules", authenticateJWT, async (req, res) => {
    try {
      const rules = await storage.getRules();
      res.json(rules);
    } catch (error) {
      console.error("Get rules error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/rules", authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const rule = await storage.createRule(req.body);
      res.status(201).json(rule);
    } catch (error) {
      console.error("Create rule error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/rules/:id", authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      const rule = await storage.updateRule(req.params.id, req.body);
      res.json(rule);
    } catch (error) {
      console.error("Update rule error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/rules/:id", authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      await storage.deleteRule(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Delete rule error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/settings", authenticateJWT, async (req, res) => {
    try {
      const settings = await storage.getSettings();
      res.json(settings);
    } catch (error) {
      console.error("Get settings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/settings", authenticateJWT, requireRole('admin'), async (req, res) => {
    try {
      await storage.updateSettings(req.body);
      res.json({ status: "OK" });
    } catch (error) {
      console.error("Update settings error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/stats", authenticateJWT, async (req, res) => {
    try {
      const stats = await storage.getStats();
      res.json(stats);
    } catch (error) {
      console.error("Get stats error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const httpServer = createServer(app);
  
  // Setup WebSocket server
  setupWebSocket(httpServer);

  return httpServer;
}
