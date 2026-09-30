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
  SETTING_DEFAULTS,
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
  type SettingKey,
  type User,
  type InsertUser,
  type RefreshToken,
  type InsertRefreshToken,
  type SecurityAuditLog,
  type InsertSecurityAuditLog,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, lt, isNull, isNotNull, sql, count } from "drizzle-orm";

export type AlertWithRefs = Alert & {
  server: { name: string | null } | null;
  rule: { name: string | null; type: string | null } | null;
};

export interface AlertFilter {
  status?: "active" | "resolved" | "all";
  serverId?: string;
  limit?: number;
}

export interface HostInfo {
  hostname?: string;
  os?: string;
  cpuModel?: string;
  cpuCores?: number;
  collectorVersion?: string;
}

export interface MetricBucket {
  ts: string;
  [key: string]: number | string | null;
}

const num = (v: string | number | null | undefined): number | null =>
  v === null || v === undefined ? null : Number(v);

export class DatabaseStorage {
  // ---------------------------------------------------------------- users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async listUsers(): Promise<Array<Pick<User, "id" | "username" | "role" | "createdAt">>> {
    return db
      .select({ id: users.id, username: users.username, role: users.role, createdAt: users.createdAt })
      .from(users)
      .orderBy(users.username);
  }

  async updateUser(id: string, updates: Partial<Pick<User, "role" | "passwordHash">>): Promise<User | undefined> {
    const [user] = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return user;
  }

  async deleteUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async countUsers(role?: string): Promise<number> {
    const [row] = await db
      .select({ n: count() })
      .from(users)
      .where(role ? eq(users.role, role) : undefined);
    return Number(row?.n ?? 0);
  }

  async revokeUserTokens(userId: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
  }

  // -------------------------------------------------------------- servers
  async listServers(): Promise<Server[]> {
    return db.select().from(servers).orderBy(servers.name);
  }

  async getServer(id: string): Promise<Server | undefined> {
    const [server] = await db.select().from(servers).where(eq(servers.id, id));
    return server;
  }

  async getServerByKeyHash(hash: string): Promise<Server | undefined> {
    const [server] = await db.select().from(servers).where(eq(servers.apiKeyHash, hash));
    return server;
  }

  async createServer(server: InsertServer): Promise<Server> {
    const [created] = await db.insert(servers).values(server).returning();
    return created;
  }

  async updateServer(id: string, updates: Partial<InsertServer>): Promise<Server | undefined> {
    const [updated] = await db.update(servers).set(updates).where(eq(servers.id, id)).returning();
    return updated;
  }

  async deleteServer(id: string): Promise<void> {
    await db.delete(servers).where(eq(servers.id, id));
  }

  /**
   * Called on every ingest. Servers registered from the UI keep their
   * name/tags (the UI is the source of truth); auto-registered servers
   * (no per-server key) follow what the collector reports.
   */
  async upsertServerFromIngest(
    data: { id: string; name: string; tags: string[]; ip: string | null },
    host: HostInfo | undefined,
  ): Promise<Server> {
    const now = new Date();
    const hostFields = {
      hostname: host?.hostname ?? null,
      os: host?.os ?? null,
      cpuModel: host?.cpuModel ?? null,
      cpuCores: host?.cpuCores ?? null,
      collectorVersion: host?.collectorVersion ?? null,
    };
    const [row] = await db
      .insert(servers)
      .values({ ...data, ...hostFields, lastSeenAt: now })
      .onConflictDoUpdate({
        target: servers.id,
        set: {
          name: sql`CASE WHEN ${servers.apiKeyHash} IS NULL THEN excluded.name ELSE ${servers.name} END`,
          tags: sql`CASE WHEN ${servers.apiKeyHash} IS NULL THEN excluded.tags ELSE ${servers.tags} END`,
          ip: data.ip,
          hostname: sql`COALESCE(excluded.hostname, ${servers.hostname})`,
          os: sql`COALESCE(excluded.os, ${servers.os})`,
          cpuModel: sql`COALESCE(excluded.cpu_model, ${servers.cpuModel})`,
          cpuCores: sql`COALESCE(excluded.cpu_cores, ${servers.cpuCores})`,
          collectorVersion: sql`COALESCE(excluded.collector_version, ${servers.collectorVersion})`,
          lastSeenAt: now,
        },
      })
      .returning();
    return row;
  }

  // ------------------------------------------------------------ snapshots
  async insertSnapshots(sys: InsertSysSnapshot, gpus: InsertGpuSnapshot[]): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.insert(sysSnapshots).values(sys);
      if (gpus.length) await tx.insert(gpuSnapshots).values(gpus);
    });
  }

  /** Latest system snapshot of each server (one query). */
  async latestSysByServer(serverIds?: string[]): Promise<Map<string, SysSnapshot>> {
    const where = serverIds?.length ? sql`WHERE server_id IN ${serverIdsSql(serverIds)}` : sql``;
    const result = await db.execute(sql`
      SELECT DISTINCT ON (server_id) *
      FROM ${sysSnapshots}
      ${where}
      ORDER BY server_id, ts DESC`);
    const map = new Map<string, SysSnapshot>();
    for (const row of result.rows as any[]) map.set(row.server_id, mapSysRow(row));
    return map;
  }

  /**
   * Latest snapshot of each GPU of each server. Only GPUs that reported
   * during the server's last 10 minutes of activity are kept, so removed
   * GPUs disappear.
   */
  async latestGpusByServer(serverIds?: string[]): Promise<Map<string, GpuSnapshot[]>> {
    const filter = serverIds?.length ? sql`AND g.server_id IN ${serverIdsSql(serverIds)}` : sql``;
    const result = await db.execute(sql`
      SELECT DISTINCT ON (g.server_id, g.gpu_index) g.*
      FROM ${gpuSnapshots} g
      JOIN ${servers} s ON s.id = g.server_id
      WHERE g.ts > COALESCE(s.last_seen_at, now()) - interval '10 minutes' ${filter}
      ORDER BY g.server_id, g.gpu_index, g.ts DESC`);
    const map = new Map<string, GpuSnapshot[]>();
    for (const row of result.rows as any[]) {
      const list = map.get(row.server_id) ?? [];
      list.push(mapGpuRow(row));
      map.set(row.server_id, list);
    }
    return map;
  }

  /** Time series averaged into buckets so charts stay light for long ranges. */
  async getServerMetrics(serverId: string, hours: number): Promise<{
    bucketSec: number;
    system: MetricBucket[];
    gpus: MetricBucket[];
  }> {
    const bucketSec = pickBucket(hours);
    const since = new Date(Date.now() - hours * 3600 * 1000);
    const bucket = sql.raw(`to_timestamp(floor(extract(epoch from ts) / ${bucketSec}) * ${bucketSec})`);

    const [sysResult, gpuResult] = await Promise.all([
      db.execute(sql`
        SELECT ${bucket} AS bucket,
          avg(cpu_percent)::float AS cpu,
          avg(ram_percent)::float AS ram,
          avg(disk_percent)::float AS disk,
          avg(load1)::float AS load1,
          avg(net_rx_bps)::float AS net_rx,
          avg(net_tx_bps)::float AS net_tx
        FROM ${sysSnapshots}
        WHERE server_id = ${serverId} AND ts >= ${since}
        GROUP BY 1 ORDER BY 1`),
      db.execute(sql`
        SELECT ${bucket} AS bucket, gpu_index,
          avg(util_percent)::float AS util,
          avg(temp_c)::float AS temp,
          avg(power_w)::float AS power,
          avg(CASE WHEN vram_total_mb > 0 THEN vram_used_mb * 100.0 / vram_total_mb END)::float AS vram
        FROM ${gpuSnapshots}
        WHERE server_id = ${serverId} AND ts >= ${since}
        GROUP BY 1, 2 ORDER BY 1, 2`),
    ]);

    const round = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);
    const system = (sysResult.rows as any[]).map((r) => ({
      ts: new Date(r.bucket).toISOString(),
      cpu: round(r.cpu),
      ram: round(r.ram),
      disk: round(r.disk),
      load1: round(r.load1),
      netRx: round(r.net_rx),
      netTx: round(r.net_tx),
    }));

    // One row per bucket with gpu{N}_util / gpu{N}_temp / ... columns plus fleet aggregates
    const byTs = new Map<string, MetricBucket>();
    for (const r of gpuResult.rows as any[]) {
      const ts = new Date(r.bucket).toISOString();
      const row = byTs.get(ts) ?? { ts, powerTotal: 0 };
      const i = r.gpu_index;
      row[`gpu${i}_util`] = round(r.util);
      row[`gpu${i}_temp`] = round(r.temp);
      row[`gpu${i}_power`] = round(r.power);
      row[`gpu${i}_vram`] = round(r.vram);
      row.powerTotal = round(Number(row.powerTotal) + Number(r.power || 0));
      byTs.set(ts, row);
    }
    return { bucketSec, system, gpus: Array.from(byTs.values()) };
  }

  async exportServerMetrics(serverId: string, hours: number) {
    const since = new Date(Date.now() - hours * 3600 * 1000);
    const [sys, gpus] = await Promise.all([
      db.select().from(sysSnapshots)
        .where(and(eq(sysSnapshots.serverId, serverId), gte(sysSnapshots.ts, since)))
        .orderBy(sysSnapshots.ts),
      db.select().from(gpuSnapshots)
        .where(and(eq(gpuSnapshots.serverId, serverId), gte(gpuSnapshots.ts, since)))
        .orderBy(gpuSnapshots.ts, gpuSnapshots.gpuIndex),
    ]);
    return { sys, gpus };
  }

  // --------------------------------------------------------------- alerts
  async getAlerts(filter: AlertFilter = {}): Promise<AlertWithRefs[]> {
    const conditions = [];
    if (filter.status === "active") conditions.push(isNull(alerts.resolvedAt));
    if (filter.status === "resolved") conditions.push(isNotNull(alerts.resolvedAt));
    if (filter.serverId) conditions.push(eq(alerts.serverId, filter.serverId));

    const rows = await db
      .select({
        alert: alerts,
        serverName: servers.name,
        ruleName: rules.name,
        ruleType: rules.type,
      })
      .from(alerts)
      .leftJoin(servers, eq(alerts.serverId, servers.id))
      .leftJoin(rules, eq(alerts.ruleId, rules.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(alerts.firedAt))
      .limit(Math.min(filter.limit ?? 500, 2000));

    return rows.map((r) => ({
      ...r.alert,
      server: { name: r.serverName },
      rule: { name: r.ruleName, type: r.ruleType },
    }));
  }

  async getActiveAlerts(): Promise<Alert[]> {
    return db.select().from(alerts).where(isNull(alerts.resolvedAt));
  }

  async getActiveAlert(serverId: string, ruleId: string): Promise<Alert | undefined> {
    const [alert] = await db
      .select()
      .from(alerts)
      .where(and(eq(alerts.serverId, serverId), eq(alerts.ruleId, ruleId), isNull(alerts.resolvedAt)));
    return alert;
  }

  async createAlert(alert: InsertAlert): Promise<Alert> {
    const [created] = await db.insert(alerts).values(alert).returning();
    return created;
  }

  async resolveAlert(alertId: string, by: string): Promise<Alert | undefined> {
    const [alert] = await db
      .update(alerts)
      .set({ resolvedAt: new Date(), resolvedBy: by })
      .where(and(eq(alerts.id, alertId), isNull(alerts.resolvedAt)))
      .returning();
    return alert;
  }

  async acknowledgeAlert(alertId: string, by: string): Promise<Alert | undefined> {
    const [alert] = await db
      .update(alerts)
      .set({ acknowledgedAt: new Date(), acknowledgedBy: by })
      .where(and(eq(alerts.id, alertId), isNull(alerts.resolvedAt), isNull(alerts.acknowledgedAt)))
      .returning();
    return alert;
  }

  async resolveAlertsForServer(serverId: string, by: string): Promise<void> {
    await db
      .update(alerts)
      .set({ resolvedAt: new Date(), resolvedBy: by })
      .where(and(eq(alerts.serverId, serverId), isNull(alerts.resolvedAt)));
  }

  async countResolvedSince(since: Date): Promise<number> {
    const [row] = await db.select({ n: count() }).from(alerts).where(gte(alerts.resolvedAt, since));
    return Number(row?.n ?? 0);
  }

  // ---------------------------------------------------------------- rules
  async getRules(): Promise<Rule[]> {
    return db.select().from(rules).orderBy(rules.name);
  }

  async getActiveRules(): Promise<Rule[]> {
    return db.select().from(rules).where(eq(rules.enabled, true));
  }

  async createRule(rule: InsertRule): Promise<Rule> {
    const [created] = await db.insert(rules).values(rule).returning();
    return created;
  }

  async updateRule(ruleId: string, updates: Partial<InsertRule>): Promise<Rule | undefined> {
    const [updated] = await db.update(rules).set(updates).where(eq(rules.id, ruleId)).returning();
    return updated;
  }

  async deleteRule(ruleId: string): Promise<void> {
    await db.delete(rules).where(eq(rules.id, ruleId));
  }

  async countRules(): Promise<number> {
    const [row] = await db.select({ n: count() }).from(rules);
    return Number(row?.n ?? 0);
  }

  // ------------------------------------------------------------- settings
  async getSettings(): Promise<Record<SettingKey, string>> {
    const rows = await db.select().from(settings);
    const result = { ...SETTING_DEFAULTS };
    for (const row of rows) {
      if (row.key in result) result[row.key as SettingKey] = row.value ?? "";
    }
    return result;
  }

  async updateSettings(updates: Partial<Record<SettingKey, string>>): Promise<void> {
    for (const [key, value] of Object.entries(updates)) {
      if (value === undefined) continue;
      await db
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
    }
  }

  // ------------------------------------------------------------ retention
  async purgeOldData(metricsDays: number, alertsDays: number): Promise<{ snapshots: number; alerts: number }> {
    const metricsCutoff = new Date(Date.now() - metricsDays * 86400 * 1000);
    const alertsCutoff = new Date(Date.now() - alertsDays * 86400 * 1000);
    const g = await db.delete(gpuSnapshots).where(lt(gpuSnapshots.ts, metricsCutoff));
    const s = await db.delete(sysSnapshots).where(lt(sysSnapshots.ts, metricsCutoff));
    const a = await db.delete(alerts).where(and(isNotNull(alerts.resolvedAt), lt(alerts.resolvedAt, alertsCutoff)));
    await db.delete(securityAuditLog).where(lt(securityAuditLog.timestamp, alertsCutoff));
    return { snapshots: (g.rowCount ?? 0) + (s.rowCount ?? 0), alerts: a.rowCount ?? 0 };
  }

  // ------------------------------------------------------------- security
  async storeRefreshToken(tokenData: InsertRefreshToken): Promise<RefreshToken> {
    const [token] = await db.insert(refreshTokens).values(tokenData).returning();
    return token;
  }

  async getRefreshToken(token: string): Promise<RefreshToken | undefined> {
    const [row] = await db.select().from(refreshTokens).where(eq(refreshTokens.token, token));
    return row;
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
  }

  async cleanupExpiredTokens(): Promise<void> {
    await db.delete(refreshTokens).where(lt(refreshTokens.expiresAt, new Date()));
  }

  async updateRefreshTokenLastUsed(token: string, lastUsedAt: Date): Promise<void> {
    await db.update(refreshTokens).set({ lastUsedAt }).where(eq(refreshTokens.token, token));
  }

  async logSecurityEvent(eventData: InsertSecurityAuditLog): Promise<SecurityAuditLog> {
    const [event] = await db.insert(securityAuditLog).values(eventData).returning();
    return event;
  }

  async getSecurityAuditLog(limit = 100): Promise<Array<SecurityAuditLog & { username: string | null }>> {
    const rows = await db
      .select({ event: securityAuditLog, username: users.username })
      .from(securityAuditLog)
      .leftJoin(users, eq(securityAuditLog.userId, users.id))
      .orderBy(desc(securityAuditLog.timestamp))
      .limit(limit);
    return rows.map((r) => ({ ...r.event, username: r.username }));
  }

  async ping(): Promise<void> {
    await db.execute(sql`SELECT 1`);
  }
}

function serverIdsSql(ids: string[]) {
  return sql`(${sql.join(ids.map((id) => sql`${id}`), sql`, `)})`;
}

function pickBucket(hours: number): number {
  if (hours <= 1) return 30;
  if (hours <= 6) return 120;
  if (hours <= 24) return 600;
  if (hours <= 72) return 1800;
  return 3600;
}

function mapSysRow(r: any): SysSnapshot {
  return {
    id: r.id,
    serverId: r.server_id,
    cpuPercent: r.cpu_percent,
    ramPercent: r.ram_percent,
    diskPercent: r.disk_percent,
    load1: r.load1,
    load5: r.load5,
    load15: r.load15,
    ramUsedMB: r.ram_used_mb,
    ramTotalMB: r.ram_total_mb,
    diskUsedGB: r.disk_used_gb,
    diskTotalGB: r.disk_total_gb,
    netRxBps: num(r.net_rx_bps),
    netTxBps: num(r.net_tx_bps),
    uptimeSec: r.uptime_sec,
    ts: new Date(r.ts),
  };
}

function mapGpuRow(r: any): GpuSnapshot {
  return {
    id: r.id,
    serverId: r.server_id,
    gpuIndex: r.gpu_index,
    vendor: r.vendor,
    name: r.name,
    uuid: r.uuid,
    utilPercent: r.util_percent,
    vramUsedMB: r.vram_used_mb,
    vramTotalMB: r.vram_total_mb,
    tempC: r.temp_c,
    powerW: r.power_w,
    fanPercent: r.fan_percent,
    driverVersion: r.driver_version,
    ts: new Date(r.ts),
  };
}

export const storage = new DatabaseStorage();
