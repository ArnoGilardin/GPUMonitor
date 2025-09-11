import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, timestamp, decimal, boolean, jsonb } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const servers = pgTable("servers", {
  id: varchar("id").primaryKey(),
  name: text("name").notNull(),
  tags: text("tags").array().default(sql`'{}'::text[]`),
  ip: text("ip"),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const gpuSnapshots = pgTable("gpu_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  gpuIndex: integer("gpu_index").notNull(),
  vendor: text("vendor").notNull(), // "nvidia" | "amd"
  utilPercent: decimal("util_percent", { precision: 5, scale: 2 }),
  vramUsedMB: integer("vram_used_mb"),
  vramTotalMB: integer("vram_total_mb"),
  tempC: decimal("temp_c", { precision: 5, scale: 2 }),
  powerW: decimal("power_w", { precision: 7, scale: 2 }),
  fanPercent: decimal("fan_percent", { precision: 5, scale: 2 }),
  driverVersion: text("driver_version"),
  ts: timestamp("ts").defaultNow().notNull(),
});

export const sysSnapshots = pgTable("sys_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  cpuPercent: decimal("cpu_percent", { precision: 5, scale: 2 }),
  ramPercent: decimal("ram_percent", { precision: 5, scale: 2 }),
  diskPercent: decimal("disk_percent", { precision: 5, scale: 2 }),
  load1: decimal("load1", { precision: 5, scale: 2 }),
  uptimeSec: integer("uptime_sec"),
  ts: timestamp("ts").defaultNow().notNull(),
});

export const rules = pgTable("rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // "gpu_temp" | "gpu_util" | "vram_util" | "cpu_util" | "disk_util"
  threshold: decimal("threshold", { precision: 7, scale: 2 }).notNull(),
  durationSec: integer("duration_sec").notNull(),
  level: text("level").notNull(), // "warning" | "critical"
  enabled: boolean("enabled").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const alerts = pgTable("alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  serverId: varchar("server_id").notNull().references(() => servers.id, { onDelete: "cascade" }),
  ruleId: varchar("rule_id").notNull().references(() => rules.id, { onDelete: "cascade" }),
  level: text("level").notNull(), // "warning" | "critical"
  message: text("message").notNull(),
  firedAt: timestamp("fired_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

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

// Ingest payload schema
export const ingestPayloadSchema = z.object({
  server: z.object({
    id: z.string(),
    name: z.string(),
    tags: z.array(z.string()).optional(),
  }),
  sys: z.object({
    cpuPercent: z.number(),
    ramPercent: z.number(),
    diskPercent: z.number(),
    load1: z.number(),
    uptimeSec: z.number(),
  }),
  gpus: z.array(z.object({
    gpuIndex: z.number(),
    vendor: z.enum(["nvidia", "amd"]),
    utilPercent: z.number(),
    vramUsedMB: z.number(),
    vramTotalMB: z.number(),
    tempC: z.number(),
    powerW: z.number(),
    fanPercent: z.number(),
    driverVersion: z.string(),
  })),
  ts: z.string(),
});

export type IngestPayload = z.infer<typeof ingestPayloadSchema>;
