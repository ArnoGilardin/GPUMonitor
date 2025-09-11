import helmet from "helmet";
import slowDown from "express-slow-down";
import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";
import { storage } from "../storage";

// Security headers middleware
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "https:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for Vite dev compatibility
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// Progressive delay for repeated requests
export const authSlowDown = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 3, // Allow 3 requests per windowMs without delay
  delayMs: (hits) => hits * 1000, // 1s, 2s, 3s delay for subsequent requests
  maxDelayMs: 10000, // Maximum delay of 10 seconds
  skipSuccessfulRequests: true,
});

// Enhanced rate limiting with IPv6-safe IP tracking
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "development" ? 100 : 5, // Much stricter in production
  standardHeaders: true,
  legacyHeaders: false,
  // Remove custom keyGenerator to use default IPv6-safe implementation
  handler: (req: Request, res: Response) => {
    // Log potential brute force attempt
    logSecurityEvent({
      eventType: "rate_limit_exceeded",
      severity: "warning",
      ipAddress: req.ip,
      userAgent: req.get("User-Agent"),
      details: { path: req.path, method: req.method },
    });
    
    res.status(429).json({
      message: "Too many requests. Please try again later.",
      retryAfter: Math.round(15 * 60), // 15 minutes in seconds
    });
  },
  skip: (req) => {
    // Skip rate limiting for development auth endpoints
    return process.env.NODE_ENV === "development" && req.path.startsWith("/api/auth");
  },
});

// API key rate limiting for collector endpoints
export const collectorRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // Allow frequent requests from collectors
  keyGenerator: (req) => {
    // Use API key as identifier instead of IP for collectors
    const apiKey = req.headers["x-api-key"] as string;
    if (apiKey) {
      return `api:${apiKey}`;
    }
    // Use default IPv6-safe implementation for non-API requests
    throw new Error("API key required for collector endpoints");
  },
  handler: (req: Request, res: Response) => {
    logSecurityEvent({
      eventType: "collector_rate_limit_exceeded",
      severity: "warning",
      ipAddress: req.ip,
      details: { apiKey: req.headers["x-api-key"], path: req.path },
    });
    
    res.status(429).json({
      message: "Rate limit exceeded for collector API",
      retryAfter: 60,
    });
  },
});

// Security audit logging function
export async function logSecurityEvent(event: {
  userId?: string;
  eventType: string;
  severity?: "info" | "warning" | "critical";
  ipAddress?: string;
  userAgent?: string;
  details?: any;
}) {
  try {
    await storage.logSecurityEvent({
      userId: event.userId || null,
      eventType: event.eventType,
      severity: event.severity || "info",
      ipAddress: event.ipAddress || null,
      userAgent: event.userAgent || null,
      details: event.details || null,
    });
  } catch (error) {
    // Don't let audit logging errors break the main flow
    console.error("Failed to log security event:", error);
  }
}

// Device fingerprinting helper
export function generateDeviceFingerprint(req: Request): string {
  const userAgent = req.get("User-Agent") || "";
  const acceptLanguage = req.get("Accept-Language") || "";
  const acceptEncoding = req.get("Accept-Encoding") || "";
  
  // Simple fingerprint based on headers (in production, consider more sophisticated methods)
  const fingerprint = Buffer.from(`${userAgent}:${acceptLanguage}:${acceptEncoding}`).toString("base64");
  return fingerprint.substring(0, 64); // Limit length
}

// Request sanitization middleware
export function sanitizeRequest(req: Request, res: Response, next: NextFunction) {
  // Basic XSS protection - strip script tags from request bodies
  if (req.body && typeof req.body === "object") {
    sanitizeObject(req.body);
  }
  
  next();
}

function sanitizeObject(obj: any): void {
  if (obj && typeof obj === "object") {
    for (const key in obj) {
      if (typeof obj[key] === "string") {
        // Remove script tags and potential XSS vectors
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
          .replace(/javascript:/gi, "")
          .replace(/on\w+\s*=/gi, "");
      } else if (typeof obj[key] === "object") {
        sanitizeObject(obj[key]);
      }
    }
  }
}