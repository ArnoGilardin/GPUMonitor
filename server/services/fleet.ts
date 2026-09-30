import type { Alert, FleetStats, GpuSnapshot, GpuView, Server, ServerStatus, ServerView, SysSnapshot } from "@shared/schema";
import { storage } from "../storage";

export function computeStatus(
  server: Pick<Server, "maintenance" | "lastSeenAt">,
  activeAlerts: Pick<Alert, "level">[],
  offlineAfterSec: number,
  now = Date.now(),
): ServerStatus {
  if (server.maintenance) return "maintenance";
  if (!server.lastSeenAt) return "pending";
  if (now - new Date(server.lastSeenAt).getTime() > offlineAfterSec * 1000) return "offline";
  if (activeAlerts.some((a) => a.level === "critical")) return "error";
  if (activeAlerts.some((a) => a.level === "warning")) return "warning";
  return "online";
}

function toGpuView(g: GpuSnapshot): GpuView {
  return {
    gpuIndex: g.gpuIndex,
    vendor: g.vendor,
    name: g.name || (g.vendor === "nvidia" ? "NVIDIA GPU" : "AMD GPU"),
    uuid: g.uuid,
    utilPercent: Number(g.utilPercent ?? 0),
    vramUsedMB: g.vramUsedMB ?? 0,
    vramTotalMB: g.vramTotalMB ?? 0,
    tempC: Number(g.tempC ?? 0),
    powerW: Number(g.powerW ?? 0),
    fanPercent: Number(g.fanPercent ?? 0),
    driverVersion: g.driverVersion,
  };
}

export function buildServerView(
  server: Server,
  sys: SysSnapshot | undefined,
  gpuRows: GpuSnapshot[],
  activeAlerts: Alert[],
  offlineAfterSec: number,
): ServerView {
  const status = computeStatus(server, activeAlerts, offlineAfterSec);
  const live = status !== "offline" && status !== "pending";
  const gpus = gpuRows.map(toGpuView).sort((a, b) => a.gpuIndex - b.gpuIndex);
  const n = (v: string | number | null | undefined) => (v === null || v === undefined ? null : Number(v));

  return {
    id: server.id,
    name: server.name,
    tags: server.tags ?? [],
    ip: server.ip,
    description: server.description,
    location: server.location,
    maintenance: server.maintenance,
    hasOwnKey: !!server.apiKeyHash,
    apiKeyPrefix: server.apiKeyPrefix,
    hostname: server.hostname,
    os: server.os,
    cpuModel: server.cpuModel,
    cpuCores: server.cpuCores,
    collectorVersion: server.collectorVersion,
    lastSeenAt: server.lastSeenAt ? new Date(server.lastSeenAt).toISOString() : null,
    createdAt: new Date(server.createdAt).toISOString(),
    status,
    activeAlerts: activeAlerts.length,
    cpuPercent: sys ? n(sys.cpuPercent) : null,
    ramPercent: sys ? n(sys.ramPercent) : null,
    diskPercent: sys ? n(sys.diskPercent) : null,
    load1: sys ? n(sys.load1) : null,
    uptimeSec: sys?.uptimeSec ?? null,
    gpuUtil: gpus.length ? Math.round(gpus.reduce((s, g) => s + g.utilPercent, 0) / gpus.length) : null,
    gpuCount: gpus.length,
    totalPowerW: live ? Math.round(gpus.reduce((s, g) => s + g.powerW, 0)) : 0,
    maxGpuTempC: gpus.length ? Math.max(...gpus.map((g) => g.tempC)) : null,
    gpus,
  };
}

export async function getServerViews(ids?: string[]): Promise<ServerView[]> {
  const [serverList, sysMap, gpuMap, active, settings] = await Promise.all([
    storage.listServers(),
    storage.latestSysByServer(ids),
    storage.latestGpusByServer(ids),
    storage.getActiveAlerts(),
    storage.getSettings(),
  ]);
  const offlineAfter = Number(settings.offline_after_sec) || 120;
  const alertsByServer = new Map<string, Alert[]>();
  for (const a of active) {
    const list = alertsByServer.get(a.serverId) ?? [];
    list.push(a);
    alertsByServer.set(a.serverId, list);
  }
  return serverList
    .filter((s) => !ids || ids.includes(s.id))
    .map((s) => buildServerView(s, sysMap.get(s.id), gpuMap.get(s.id) ?? [], alertsByServer.get(s.id) ?? [], offlineAfter));
}

export async function getServerView(id: string): Promise<ServerView | undefined> {
  const [view] = await getServerViews([id]);
  return view;
}

export function computeFleetStats(views: ServerView[], activeAlerts: Pick<Alert, "level">[], resolvedToday: number): FleetStats {
  const live = views.filter((v) => ["online", "warning", "error"].includes(v.status));
  const liveGpus = live.flatMap((v) => v.gpus);
  return {
    totalServers: views.length,
    onlineServers: live.length,
    offlineServers: views.filter((v) => v.status === "offline").length,
    totalGpus: views.reduce((s, v) => s + v.gpuCount, 0),
    avgGpuUtil: liveGpus.length ? Math.round(liveGpus.reduce((s, g) => s + g.utilPercent, 0) / liveGpus.length) : 0,
    totalPowerKW: Math.round(live.reduce((s, v) => s + v.totalPowerW, 0) / 100) / 10,
    activeAlerts: activeAlerts.length,
    criticalAlerts: activeAlerts.filter((a) => a.level === "critical").length,
    resolvedToday,
    totalVramUsedGB: Math.round(liveGpus.reduce((s, g) => s + g.vramUsedMB, 0) / 1024),
    totalVramGB: Math.round(liveGpus.reduce((s, g) => s + g.vramTotalMB, 0) / 1024),
  };
}

export async function getFleetStats(views?: ServerView[]): Promise<FleetStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [serverViews, active, resolvedToday] = await Promise.all([
    views ? Promise.resolve(views) : getServerViews(),
    storage.getActiveAlerts(),
    storage.countResolvedSince(startOfDay),
  ]);
  return computeFleetStats(serverViews, active, resolvedToday);
}
