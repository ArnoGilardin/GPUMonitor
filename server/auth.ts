import jwt from "jsonwebtoken";
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import type { Server } from "@shared/schema";
import { storage } from "./storage";
import { config } from "./config";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
  username?: string;
}

export interface CollectorRequest extends Request {
  // Set when the collector used a per-server key: the payload is bound to this server
  collectorServer?: Server;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

function signAccessToken(userId: string, role: string, username?: string) {
  return jwt.sign({ userId, role, username }, config.jwtSecret, { expiresIn: "15m" });
}

export async function generateTokenPair(
  userId: string,
  role: string,
  deviceFingerprint?: string,
  ipAddress?: string,
  userAgent?: string,
  username?: string,
): Promise<TokenPair> {
  const accessToken = signAccessToken(userId, role, username);
  // jti makes every refresh token unique even when issued in the same second
  const refreshToken = jwt.sign({ userId, type: "refresh", jti: crypto.randomUUID() }, config.refreshTokenSecret, { expiresIn: "7d" });

  await storage.storeRefreshToken({
    token: refreshToken,
    userId,
    deviceFingerprint,
    ipAddress,
    userAgent,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });

  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): { userId: string; role: string; username?: string } | null {
  try {
    return jwt.verify(token, config.jwtSecret) as { userId: string; role: string; username?: string };
  } catch {
    return null;
  }
}

export function verifyRefreshToken(token: string): { userId: string; type: string } | null {
  try {
    return jwt.verify(token, config.refreshTokenSecret) as { userId: string; type: string };
  } catch {
    return null;
  }
}

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
  req.userId = decoded.userId;
  req.userRole = decoded.role;
  req.username = decoded.username;
  next();
}

export function requireRole(requiredRole: "admin" | "viewer") {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return res.status(403).json({ message: "User role not found in token" });
    }
    // admin can do everything a viewer can
    if (req.userRole !== requiredRole && req.userRole !== "admin") {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    next();
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ token: string; userId: string } | null> {
  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded || decoded.type !== "refresh") return null;

  const storedToken = await storage.getRefreshToken(refreshToken);
  if (!storedToken || storedToken.expiresAt < new Date()) return null;

  // Role is read from the database so role changes apply at the next refresh
  const user = await storage.getUser(decoded.userId);
  if (!user) return null;

  await storage.updateRefreshTokenLastUsed(refreshToken, new Date());
  return { token: signAccessToken(user.id, user.role, user.username), userId: user.id };
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await storage.revokeRefreshToken(refreshToken);
}

// ------------------------------------------------------------ collector keys

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** Returns a new per-server key; only its hash and a short prefix are stored. */
export function generateServerKey(): { key: string; hash: string; prefix: string } {
  const key = `gpm_${crypto.randomBytes(24).toString("base64url")}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, 8) };
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function authenticateApiKey(req: CollectorRequest, res: Response, next: NextFunction) {
  const header = req.headers["x-api-key"];
  const apiKey = Array.isArray(header) ? header[0] : header;

  if (!apiKey) {
    return res.status(401).json({ message: "Invalid API key" });
  }

  if (!config.requireServerKeys && config.collectorApiKey && safeEqual(apiKey, config.collectorApiKey)) {
    return next();
  }

  try {
    const server = await storage.getServerByKeyHash(hashApiKey(apiKey));
    if (server) {
      req.collectorServer = server;
      return next();
    }
  } catch (error) {
    return next(error);
  }

  return res.status(401).json({ message: "Invalid API key" });
}
