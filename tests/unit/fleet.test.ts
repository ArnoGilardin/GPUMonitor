import { describe, it, expect } from "vitest";
import { buildServerView, computeFleetStats, computeStatus } from "../../server/services/fleet";
import type { GpuSnapshot, Server, SysSnapshot } from "@shared/schema";

const now = Date.now();
const baseServer: Server = {
  id: "s1", name: "S1", tags: ["a"], ip: null, description: null, location: null,
  apiKeyHash: null, apiKeyPrefix: null, maintenance: false, hostname: null, os: null,
  cpuModel: null, cpuCores: null, collectorVersion: null,
  lastSeenAt: new Date(now - 10_000), createdAt: new Date(now - 86400_000),
};

describe("computeStatus", () => {
  it("is pending before the first report", () => {
    expect(computeStatus({ maintenance: false, lastSeenAt: null }, [], 120, now)).toBe("pending");
  });
  it("is offline after the threshold", () => {
    expect(computeStatus({ maintenance: false, lastSeenAt: new Date(now - 121_000) }, [], 120, now)).toBe("offline");
  });
  it("reflects the worst active alert", () => {
    const seen = { maintenance: false, lastSeenAt: new Date(now - 5000) };
    expect(computeStatus(seen, [], 120, now)).toBe("online");
    expect(computeStatus(seen, [{ level: "warning" }], 120, now)).toBe("warning");
    expect(computeStatus(seen, [{ level: "warning" }, { level: "critical" }], 120, now)).toBe("error");
  });
  it("maintenance wins over everything", () => {
    expect(computeStatus({ maintenance: true, lastSeenAt: null }, [{ level: "critical" }], 120, now)).toBe("maintenance");
  });
});

function gpu(i: number, util: number, power: number): GpuSnapshot {
  return {
    id: `g${i}`, serverId: "s1", gpuIndex: i, vendor: "nvidia", name: "NVIDIA A100", uuid: null,
    utilPercent: String(util), vramUsedMB: 1024, vramTotalMB: 4096, tempC: "60", powerW: String(power),
    fanPercent: "30", driverVersion: "550", ts: new Date(),
  };
}

describe("buildServerView / computeFleetStats", () => {
  const sys = { cpuPercent: "10.5", ramPercent: "20", diskPercent: "30", load1: "1.5", uptimeSec: 100 } as SysSnapshot;

  it("aggregates GPUs per server", () => {
    const view = buildServerView(baseServer, sys, [gpu(1, 50, 300), gpu(0, 100, 200)], [], 120);
    expect(view.status).toBe("online");
    expect(view.gpuCount).toBe(2);
    expect(view.gpuUtil).toBe(75);
    expect(view.totalPowerW).toBe(500);
    expect(view.gpus.map((g) => g.gpuIndex)).toEqual([0, 1]);
    expect(view.cpuPercent).toBe(10.5);
  });

  it("does not count power of offline servers", () => {
    const offline = { ...baseServer, id: "s2", lastSeenAt: new Date(now - 3600_000) };
    const views = [
      buildServerView(baseServer, sys, [gpu(0, 80, 400)], [], 120),
      buildServerView(offline, sys, [gpu(0, 100, 600)], [], 120),
    ];
    const stats = computeFleetStats(views, [{ level: "critical" }, { level: "warning" }], 3);
    expect(stats.totalServers).toBe(2);
    expect(stats.onlineServers).toBe(1);
    expect(stats.offlineServers).toBe(1);
    expect(stats.totalGpus).toBe(2);
    expect(stats.avgGpuUtil).toBe(80);
    expect(stats.totalPowerKW).toBe(0.4);
    expect(stats.activeAlerts).toBe(2);
    expect(stats.criticalAlerts).toBe(1);
    expect(stats.resolvedToday).toBe(3);
  });
});
