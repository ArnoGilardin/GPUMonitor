import { describe, it, expect } from "vitest";
import { buildExposition } from "../../server/services/prometheus";
import type { ServerView } from "@shared/schema";

const view = {
  id: "gpu-01", name: 'Node "A"', status: "online", activeAlerts: 1,
  cpuPercent: 12, ramPercent: 50, diskPercent: null, load1: 3,
  gpus: [{ gpuIndex: 0, name: "NVIDIA H100", utilPercent: 90, tempC: 70, powerW: 600, vramUsedMB: 1024, vramTotalMB: 2048, fanPercent: 0, smClockMHz: null, eccUncorrected: 0, throttleMask: 0x40 }],
} as unknown as ServerView;

describe("buildExposition", () => {
  const text = buildExposition([view], [{ level: "critical" }]);
  it("emits one HELP/TYPE per metric and escapes labels", () => {
    expect(text.match(/# TYPE gpumon_server_up gauge/g)).toHaveLength(1);
    expect(text).toContain('gpumon_server_up{server="gpu-01",name="Node \\"A\\""} 1');
  });
  it("exports GPU metrics with units", () => {
    expect(text).toContain('gpumon_gpu_memory_used_bytes{server="gpu-01",gpu="0",model="NVIDIA H100"} 1073741824');
    expect(text).toContain('gpumon_gpu_throttled{server="gpu-01",gpu="0",model="NVIDIA H100"} 1');
    expect(text).toContain('gpumon_alerts_active{level="critical"} 1');
  });
  it("skips missing values", () => {
    expect(text).not.toContain("gpumon_disk_percent");
    expect(text).not.toContain("gpumon_gpu_sm_clock_mhz");
  });
});
