import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const JWT_SECRET = process.env.JWT_SECRET || "development-secret-key";
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || "development-refresh-secret";
const API_KEY = process.env.COLLECTOR_API_KEY || "collector-key-123";

// Database storage for refresh tokens (replacing in-memory storage)
import { storage } from "./storage";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export async function generateTokenPair(userId: string, role: string, deviceFingerprint?: string, ipAddress?: string, userAgent?: string): Promise<TokenPair> {
  const accessToken = jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "15m" });
  const refreshToken = jwt.sign({ userId, type: "refresh" }, REFRESH_TOKEN_SECRET, { expiresIn: "7d" });
  
  // Store refresh token in database with security metadata
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await storage.storeRefreshToken({
    token: refreshToken,
    userId,
    deviceFingerprint,
    ipAddress,
    userAgent,
    expiresAt,
  });
  
  return { accessToken, refreshToken };
}

// Legacy function for backward compatibility
export function generateJWT(userId: string, role: string): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "15m" });
}

export function authenticateJWT(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access token required" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRole(requiredRole: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.userRole) {
      return res.status(403).json({ message: "User role not found in token" });
    }
    
    if (req.userRole !== requiredRole) {
      return res.status(403).json({ message: "Insufficient permissions" });
    }
    
    next();
  };
}

export async function refreshAccessToken(refreshToken: string, userRole: string): Promise<string | null> {
  try {
    // Verify refresh token
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET) as { 
      userId: string; 
      type: string; 
    };
    
    if (decoded.type !== "refresh") {
      return null;
    }
    
    // Check if token exists in database and not expired
    const storedToken = await storage.getRefreshToken(refreshToken);
    if (!storedToken || storedToken.expiresAt < new Date()) {
      return null;
    }
    
    // Update last used timestamp
    await storage.updateRefreshTokenLastUsed(refreshToken, new Date());
    
    // Generate new access token
    return jwt.sign({ userId: decoded.userId, role: userRole }, JWT_SECRET, { expiresIn: "15m" });
  } catch (error) {
    return null;
  }
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await storage.revokeRefreshToken(refreshToken);
}

export function authenticateApiKey(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers["x-api-key"];

  if (!apiKey || apiKey !== API_KEY) {
    return res.status(401).json({ message: "Invalid API key" });
  }

  next();
}
