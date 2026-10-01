import { describe, it, expect } from "vitest";
import { BreachTracker, alertMessage, metricValue, ruleAppliesTo, type LatestSample } from "../../server/services/rules-engine";

const sample: LatestSample = {
  sys: { cpuPercent: 42, ramPercent: 91, diskPercent: 77, load1: 12.5 },
  gpus: [
    { utilPercent: 90, vramUsedMB: 70000, vramTotalMB: 80000, tempC: 84, powerW: 650 },
    { utilPercent: 10, vramUsedMB: 1000, vramTotalMB: 80000, tempC: 45, powerW: 80 },
  ],
};

describe("metricValue", () => {
  it("uses the hottest GPU for temperature", () => {
    expect(metricValue("gpu_temp", sample)).toBe(84);
  });
  it("averages GPU utilization", () => {
    expect(metricValue("gpu_util", sample)).toBe(50);
  });
  it("uses the fullest GPU for VRAM", () => {
    expect(metricValue("vram_util", sample)).toBeCloseTo(87.5);
  });
  it("sums GPU power", () => {
    expect(metricValue("gpu_power", sample)).toBe(730);
  });
  it("reads system metrics", () => {
    expect(metricValue("cpu_util", sample)).toBe(42);
    expect(metricValue("ram_util", sample)).toBe(91);
    expect(metricValue("disk_util", sample)).toBe(77);
    expect(metricValue("load1", sample)).toBe(12.5);
  });
  it("reads ECC errors and counts throttled GPUs", () => {
    const gpus = [
      { ...sample.gpus[0], eccUncorrected: 0, throttleMask: 0x40 },
      { ...sample.gpus[1], eccUncorrected: 3, throttleMask: 0x4 },
    ];
    expect(metricValue("gpu_ecc_errors", { sys: null, gpus })).toBe(3);
    // power cap (0x4) is normal operation, HW thermal (0x40) is a problem
    expect(metricValue("gpu_throttling", { sys: null, gpus })).toBe(1);
    expect(metricValue("gpu_ecc_errors", sample)).toBeUndefined();
    expect(metricValue("gpu_throttling", sample)).toBeUndefined();
  });
  it("returns undefined without data", () => {
    expect(metricValue("gpu_temp", { sys: null, gpus: [] })).toBeUndefined();
    expect(metricValue("cpu_util", { sys: null, gpus: [] })).toBeUndefined();
    expect(metricValue("vram_util", { sys: null, gpus: [{ ...sample.gpus[0], vramTotalMB: 0 }] })).toBeUndefined();
    expect(metricValue("server_offline", sample)).toBeUndefined();
  });
});

describe("ruleAppliesTo", () => {
  const server = { id: "a", tags: ["paris", "training"] };
  it("applies unscoped rules everywhere", () => {
    expect(ruleAppliesTo({ serverId: null, tag: null }, server)).toBe(true);
  });
  it("filters by server", () => {
    expect(ruleAppliesTo({ serverId: "a", tag: null }, server)).toBe(true);
    expect(ruleAppliesTo({ serverId: "b", tag: null }, server)).toBe(false);
  });
  it("filters by tag", () => {
    expect(ruleAppliesTo({ serverId: null, tag: "paris" }, server)).toBe(true);
    expect(ruleAppliesTo({ serverId: null, tag: "lyon" }, server)).toBe(false);
    expect(ruleAppliesTo({ serverId: null, tag: "paris" }, { id: "c", tags: null })).toBe(false);
  });
});

describe("BreachTracker", () => {
  it("fires immediately when duration is 0", () => {
    const t = new BreachTracker();
    expect(t.update("s:r", true, 0, 1000)).toBe("fire");
  });
  it("waits for the duration before firing", () => {
    const t = new BreachTracker();
    expect(t.update("s:r", true, 60, 0)).toBe("pending");
    expect(t.update("s:r", true, 60, 30_000)).toBe("pending");
    expect(t.update("s:r", true, 60, 60_000)).toBe("fire");
  });
  it("restarts the window when the condition clears", () => {
    const t = new BreachTracker();
    t.update("s:r", true, 60, 0);
    expect(t.update("s:r", false, 60, 50_000)).toBe("clear");
    expect(t.update("s:r", true, 60, 70_000)).toBe("pending");
    expect(t.update("s:r", true, 60, 130_000)).toBe("fire");
  });
  it("forgets a server", () => {
    const t = new BreachTracker();
    t.update("s:r", true, 60, 0);
    t.update("other:r", true, 60, 0);
    t.forgetServer("s");
    expect(t.update("s:r", true, 60, 60_000)).toBe("pending");
    expect(t.update("other:r", true, 60, 60_000)).toBe("fire");
  });
});

describe("alertMessage", () => {
  it("describes metric breaches with units", () => {
    expect(alertMessage({ type: "gpu_temp", threshold: "80" }, 84.26)).toBe(
      "GPU temperature (max) is 84.3°C (threshold 80°C)",
    );
  });
  it("describes offline servers with durations", () => {
    expect(alertMessage({ type: "server_offline", threshold: "180" }, 400)).toBe(
      "No data received for 7m (threshold 3m)",
    );
  });
});
