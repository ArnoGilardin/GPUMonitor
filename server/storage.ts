import { 
  servers, 
  gpuSnapshots, 
  sysSnapshots, 
  alerts, 
  rules, 
  settings, 
  users,
  refreshTokens,
  securityAuditLog,
  type Server, 
  type InsertServer,
  type GpuSnapshot,
  type InsertGpuSnapshot,
  type SysSnapshot,
  type InsertSysSnapshot,
  type Alert,
  type InsertAlert,
  type Rule,
  type InsertRule,
  type Setting,
  type InsertSetting,
  type User, 
  type InsertUser,
  type RefreshToken,
  type InsertRefreshToken,
  type SecurityAuditLog,
  type InsertSecurityAuditLog
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, isNull, sql } from "drizzle-orm";

export interface IStorage {
  // User management
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Server management
  upsertServer(server: InsertServer): Promise<void>;
  getServersWithMetrics(): Promise<any[]>;
  getServerWithDetails(id: string): Promise<any>;
  getServerMetrics(serverId: string, hours: number): Promise<any>;

  // Metrics ingestion
  insertGpuSnapshot(snapshot: InsertGpuSnapshot): Promise<void>;
  insertSysSnapshot(snapshot: InsertSysSnapshot): Promise<void>;

  // Alerts and rules
  getAlerts(resolved?: boolean): Promise<Alert[]>;
  getActiveAlert(serverId: string, ruleId: string): Promise<Alert | undefined>;
  createAlert(alert: InsertAlert): Promise<Alert>;
  resolveAlert(alertId: string): Promise<void>;
  getRules(): Promise<Rule[]>;
  getActiveRules(): Promise<Rule[]>;
  createRule(rule: InsertRule): Promise<Rule>;
  updateRule(ruleId: string, updates: Partial<InsertRule>): Promise<Rule>;
  deleteRule(ruleId: string): Promise<void>;
  checkAlertDuration(serverId: string, ruleId: string, durationSec: number): Promise<boolean>;

  // Settings
  getSettings(): Promise<Setting[]>;
  updateSettings(updates: Record<string, string>): Promise<void>;

  // Stats and monitoring
  getStats(): Promise<any>;
  getLatestMetrics(serverId: string): Promise<any>;

  // Security features
  storeRefreshToken(token: InsertRefreshToken): Promise<RefreshToken>;
  getRefreshToken(token: string): Promise<RefreshToken | undefined>;
  revokeRefreshToken(token: string): Promise<void>;
  cleanupExpiredTokens(): Promise<void>;
  updateRefreshTokenLastUsed(token: string, lastUsedAt: Date): Promise<void>;
  logSecurityEvent(event: InsertSecurityAuditLog): Promise<SecurityAuditLog>;
  getSecurityAuditLog(limit?: number): Promise<SecurityAuditLog[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async upsertServer(server: InsertServer): Promise<void> {
    await db
      .insert(servers)
      .values({
        ...server,
        lastSeenAt: new Date(),
      })
      .onConflictDoUpdate({
        target: servers.id,
        set: {
          name: server.name,
          tags: server.tags,
          ip: server.ip,
          lastSeenAt: new Date(),
        },
      });
  }

  async getServersWithMetrics(): Promise<any[]> {
    const serverList = await db
      .select({
        id: servers.id,
        name: servers.name,
        tags: servers.tags,
        ip: servers.ip,
        lastSeenAt: servers.lastSeenAt,
        createdAt: servers.createdAt,
      })
      .from(servers)
      .orderBy(servers.name);

    const result = [];
    for (const server of serverList) {
      // Get latest system metrics
      const [latestSys] = await db
        .select()
        .from(sysSnapshots)
        .where(eq(sysSnapshots.serverId, server.id))
        .orderBy(desc(sysSnapshots.ts))
        .limit(1);

      // Get latest GPU metrics
      const latestGpus = await db
        .select()
        .from(gpuSnapshots)
        .where(eq(gpuSnapshots.serverId, server.id))
        .orderBy(desc(gpuSnapshots.ts))
        .limit(10);

      // Calculate server status
      const lastSeen = server.lastSeenAt ? new Date(server.lastSeenAt) : null;
      const now = new Date();
      const minutesSinceLastSeen = lastSeen ? (now.getTime() - lastSeen.getTime()) / 1000 / 60 : Infinity;

      let status = "offline";
      if (minutesSinceLastSeen < 2) {
        // Check for critical conditions
        const hasCriticalTemp = latestGpus.some(gpu => parseFloat(gpu.tempC || "0") > 85);
        const hasCriticalUtil = latestSys && parseFloat(latestSys.cpuPercent || "0") > 90;
        
        if (hasCriticalTemp || hasCriticalUtil) {
          status = "error";
        } else {
          // Check for warning conditions
          const hasWarningTemp = latestGpus.some(gpu => parseFloat(gpu.tempC || "0") > 80);
          const hasWarningUtil = latestSys && (
            parseFloat(latestSys.cpuPercent || "0") > 80 || 
            parseFloat(latestSys.ramPercent || "0") > 85
          );
          
          status = hasWarningTemp || hasWarningUtil ? "warning" : "online";
        }
      }

      // Calculate average GPU utilization
      const avgGpuUtil = latestGpus.length > 0 
        ? latestGpus.reduce((sum, gpu) => sum + parseFloat(gpu.utilPercent || "0"), 0) / latestGpus.length
        : 0;

      result.push({
        ...server,
        status,
        cpuPercent: latestSys ? parseFloat(latestSys.cpuPercent || "0") : undefined,
        ramPercent: latestSys ? parseFloat(latestSys.ramPercent || "0") : undefined,
        gpuUtil: Math.round(avgGpuUtil),
        gpus: latestGpus.map(gpu => ({
          name: gpu.vendor === "nvidia" ? "NVIDIA GPU" : "AMD GPU",
          tempC: parseFloat(gpu.tempC || "0"),
          powerW: parseFloat(gpu.powerW || "0"),
        })),
        lastSeen: minutesSinceLastSeen < 60 
          ? `${Math.round(minutesSinceLastSeen)}m ago`
          : minutesSinceLastSeen < 1440
            ? `${Math.round(minutesSinceLastSeen / 60)}h ago`
            : `${Math.round(minutesSinceLastSeen / 1440)}d ago`,
      });
    }

    return result;
  }

  async getServerWithDetails(id: string): Promise<any> {
    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, id));

    if (!server) return null;

    // Get latest GPU snapshots
    const latestGpus = await db
      .select()
      .from(gpuSnapshots)
      .where(eq(gpuSnapshots.serverId, id))
      .orderBy(desc(gpuSnapshots.ts))
      .limit(10);

    // Get latest system snapshot
    const [latestSys] = await db
      .select()
      .from(sysSnapshots)
      .where(eq(sysSnapshots.serverId, id))
      .orderBy(desc(sysSnapshots.ts))
      .limit(1);

    return {
      ...server,
      gpus: latestGpus.map(gpu => ({
        ...gpu,
        model: `${gpu.vendor?.toUpperCase()} GPU`,
        utilPercent: parseFloat(gpu.utilPercent || "0"),
        tempC: parseFloat(gpu.tempC || "0"),
        powerW: parseFloat(gpu.powerW || "0"),
        fanPercent: parseFloat(gpu.fanPercent || "0"),
      })),
      system: latestSys,
    };
  }

  async getServerMetrics(serverId: string, hours: number): Promise<any> {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const [gpuMetrics, sysMetrics] = await Promise.all([
      db
        .select()
        .from(gpuSnapshots)
        .where(and(
          eq(gpuSnapshots.serverId, serverId),
          gte(gpuSnapshots.ts, since)
        ))
        .orderBy(gpuSnapshots.ts),
      db
        .select()
        .from(sysSnapshots)
        .where(and(
          eq(sysSnapshots.serverId, serverId),
          gte(sysSnapshots.ts, since)
        ))
        .orderBy(sysSnapshots.ts),
    ]);

    return { gpuMetrics, sysMetrics };
  }

  async insertGpuSnapshot(snapshot: InsertGpuSnapshot): Promise<void> {
    await db.insert(gpuSnapshots).values(snapshot);
  }

  async insertSysSnapshot(snapshot: InsertSysSnapshot): Promise<void> {
    await db.insert(sysSnapshots).values(snapshot);
  }

  async getAlerts(resolved?: boolean): Promise<Alert[]> {
    const baseQuery = db
      .select({
        id: alerts.id,
        serverId: alerts.serverId,
        ruleId: alerts.ruleId,
        level: alerts.level,
        message: alerts.message,
        firedAt: alerts.firedAt,
        resolvedAt: alerts.resolvedAt,
        server: {
          name: servers.name,
        },
        rule: {
          name: rules.name,
        },
      })
      .from(alerts)
      .leftJoin(servers, eq(alerts.serverId, servers.id))
      .leftJoin(rules, eq(alerts.ruleId, rules.id));

    if (resolved === true) {
      return baseQuery
        .where(sql`${alerts.resolvedAt} IS NOT NULL`)
        .orderBy(desc(alerts.firedAt));
    } else if (resolved === false) {
      return baseQuery
        .where(isNull(alerts.resolvedAt))
        .orderBy(desc(alerts.firedAt));
    }

    return baseQuery.orderBy(desc(alerts.firedAt));
  }

  async getActiveAlert(serverId: string, ruleId: string): Promise<Alert | undefined> {
    const [alert] = await db
      .select()
      .from(alerts)
      .where(and(
        eq(alerts.serverId, serverId),
        eq(alerts.ruleId, ruleId),
        isNull(alerts.resolvedAt)
      ));
    return alert;
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    const [newAlert] = await db
      .insert(alerts)
      .values(alert)
      .returning();
    return newAlert;
  }

  async resolveAlert(alertId: string): Promise<void> {
    await db
      .update(alerts)
      .set({ resolvedAt: new Date() })
      .where(eq(alerts.id, alertId));
  }

  async getRules(): Promise<Rule[]> {
    return db.select().from(rules).orderBy(rules.name);
  }

  async getActiveRules(): Promise<Rule[]> {
    return db
      .select()
      .from(rules)
      .where(eq(rules.enabled, true));
  }

  async createRule(rule: InsertRule): Promise<Rule> {
    const [newRule] = await db
      .insert(rules)
      .values(rule)
      .returning();
    return newRule;
  }

  async updateRule(ruleId: string, updates: Partial<InsertRule>): Promise<Rule> {
    const [updatedRule] = await db
      .update(rules)
      .set(updates)
      .where(eq(rules.id, ruleId))
      .returning();
    return updatedRule;
  }

  async deleteRule(ruleId: string): Promise<void> {
    await db.delete(rules).where(eq(rules.id, ruleId));
  }

  async checkAlertDuration(serverId: string, ruleId: string, durationSec: number): Promise<boolean> {
    // For simplicity, we'll check if there have been consistent violations
    // In a real implementation, you'd want to track violation history
    return true; // Simplified - fire alert immediately
  }

  async getSettings(): Promise<Setting[]> {
    return db.select().from(settings);
  }

  async updateSettings(updates: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(updates)) {
      await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value, updatedAt: new Date() },
        });
    }
  }

  async getStats(): Promise<any> {
    const [serverStats] = await db
      .select({
        totalServers: sql<number>`count(*)`,
        onlineServers: sql<number>`count(*) filter (where ${servers.lastSeenAt} > now() - interval '2 minutes')`,
      })
      .from(servers);

    const [gpuStats] = await db
      .select({
        totalGpus: sql<number>`count(distinct concat(${gpuSnapshots.serverId}, '-', ${gpuSnapshots.gpuIndex}))`,
        avgGpuUtil: sql<number>`avg(cast(${gpuSnapshots.utilPercent} as numeric))`,
      })
      .from(gpuSnapshots)
      .where(gte(gpuSnapshots.ts, sql`now() - interval '1 hour'`));

    const [powerStats] = await db
      .select({
        totalPowerKW: sql<number>`sum(cast(${gpuSnapshots.powerW} as numeric)) / 1000`,
      })
      .from(gpuSnapshots)
      .where(gte(gpuSnapshots.ts, sql`now() - interval '1 hour'`));

    return {
      totalServers: serverStats?.totalServers || 0,
      onlineServers: serverStats?.onlineServers || 0,
      totalGpus: gpuStats?.totalGpus || 0,
      avgGpuUtil: Math.round(gpuStats?.avgGpuUtil || 0),
      totalPowerKW: parseFloat((powerStats?.totalPowerKW || 0).toFixed(1)),
    };
  }

  async getLatestMetrics(serverId: string): Promise<any> {
    const [server] = await db
      .select()
      .from(servers)
      .where(eq(servers.id, serverId));

    if (!server) return null;

    const [sysSnapshot] = await db
      .select()
      .from(sysSnapshots)
      .where(eq(sysSnapshots.serverId, serverId))
      .orderBy(desc(sysSnapshots.ts))
      .limit(1);

    const gpuSnapshotData = await db
      .select()
      .from(gpuSnapshots)
      .where(eq(gpuSnapshots.serverId, serverId))
      .orderBy(desc(gpuSnapshots.ts))
      .limit(10);

    return {
      server,
      sysSnapshot,
      gpuSnapshots: gpuSnapshotData,
    };
  }
  // Security features implementation
  async storeRefreshToken(tokenData: InsertRefreshToken): Promise<RefreshToken> {
    const [token] = await db.insert(refreshTokens).values(tokenData).returning();
    return token;
  }

  async getRefreshToken(token: string): Promise<RefreshToken | undefined> {
    const [refreshToken] = await db.select().from(refreshTokens).where(eq(refreshTokens.token, token));
    return refreshToken || undefined;
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  }

  async cleanupExpiredTokens(): Promise<void> {
    await db.delete(refreshTokens).where(sql`expires_at < NOW()`);
  }

  async updateRefreshTokenLastUsed(token: string, lastUsedAt: Date): Promise<void> {
    await db.update(refreshTokens)
      .set({ lastUsedAt })
      .where(eq(refreshTokens.token, token));
  }

  async logSecurityEvent(eventData: InsertSecurityAuditLog): Promise<SecurityAuditLog> {
    const [event] = await db.insert(securityAuditLog).values(eventData).returning();
    return event;
  }

  async getSecurityAuditLog(limit: number = 100): Promise<SecurityAuditLog[]> {
    return await db.select().from(securityAuditLog)
      .orderBy(desc(securityAuditLog.timestamp))
      .limit(limit);
  }
}

export const storage = new DatabaseStorage();
