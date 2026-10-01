import { PROBLEM_THROTTLE_MASK, type ServerView } from "@shared/schema";
import { storage } from "../storage";
import { getServerViews } from "./fleet";

type Labels = Record<string, string | number>;

function escapeLabel(v: string | number) {
  return String(v).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

class Exposition {
  private lines: string[] = [];
  private declared = new Set<string>();

  add(name: string, help: string, type: "gauge" | "counter", labels: Labels, value: number | null | undefined) {
    if (value === null || value === undefined || !Number.isFinite(value)) return;
    if (!this.declared.has(name)) {
      this.declared.add(name);
      this.lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`);
    }
    const l = Object.entries(labels).map(([k, v]) => `${k}="${escapeLabel(v)}"`).join(",");
    this.lines.push(`${name}${l ? `{${l}}` : ""} ${value}`);
  }

  toString() {
    return this.lines.join("\n") + "\n";
  }
}

/** Prometheus text exposition of the current fleet state (latest sample per GPU/server). */
export function buildExposition(views: ServerView[], alerts: { level: string }[]): string {
  const m = new Exposition();
  // Metrics are grouped by name, as the exposition format expects
  for (const s of views) {
    m.add("gpumon_server_up", "1 if the server reported recently", "gauge", { server: s.id, name: s.name }, ["online", "warning", "error"].includes(s.status) ? 1 : 0);
  }
  for (const s of views) m.add("gpumon_server_maintenance", "1 if the server is in maintenance", "gauge", { server: s.id }, s.status === "maintenance" ? 1 : 0);
  for (const s of views) m.add("gpumon_server_active_alerts", "Active alerts on the server", "gauge", { server: s.id }, s.activeAlerts);
  for (const s of views) m.add("gpumon_cpu_percent", "CPU utilization", "gauge", { server: s.id }, s.cpuPercent);
  for (const s of views) m.add("gpumon_ram_percent", "RAM utilization", "gauge", { server: s.id }, s.ramPercent);
  for (const s of views) m.add("gpumon_disk_percent", "Disk utilization", "gauge", { server: s.id }, s.diskPercent);
  for (const s of views) m.add("gpumon_load1", "Load average (1 min)", "gauge", { server: s.id }, s.load1);

  const gpus = views.flatMap((s) => s.gpus.map((g) => ({ s, g, labels: { server: s.id, gpu: g.gpuIndex, model: g.name } })));
  for (const { g, labels } of gpus) m.add("gpumon_gpu_utilization_percent", "GPU utilization", "gauge", labels, g.utilPercent);
  for (const { g, labels } of gpus) m.add("gpumon_gpu_temperature_celsius", "GPU temperature", "gauge", labels, g.tempC);
  for (const { g, labels } of gpus) m.add("gpumon_gpu_power_watts", "GPU power draw", "gauge", labels, g.powerW);
  for (const { g, labels } of gpus) m.add("gpumon_gpu_memory_used_bytes", "GPU memory used", "gauge", labels, g.vramUsedMB * 1024 * 1024);
  for (const { g, labels } of gpus) m.add("gpumon_gpu_memory_total_bytes", "GPU memory total", "gauge", labels, g.vramTotalMB * 1024 * 1024);
  for (const { g, labels } of gpus) m.add("gpumon_gpu_fan_percent", "GPU fan speed", "gauge", labels, g.fanPercent);
  for (const { g, labels } of gpus) m.add("gpumon_gpu_sm_clock_mhz", "GPU SM clock", "gauge", labels, g.smClockMHz);
  for (const { g, labels } of gpus) m.add("gpumon_gpu_ecc_uncorrected_errors", "Uncorrected volatile ECC errors", "gauge", labels, g.eccUncorrected);
  for (const { g, labels } of gpus) {
    m.add("gpumon_gpu_throttled", "1 if throttled by heat or power brake", "gauge", labels, g.throttleMask === null ? null : (g.throttleMask & PROBLEM_THROTTLE_MASK) !== 0 ? 1 : 0);
  }

  for (const level of ["warning", "critical"]) {
    m.add("gpumon_alerts_active", "Active alerts by level", "gauge", { level }, alerts.filter((a) => a.level === level).length);
  }
  return m.toString();
}

export async function renderPrometheusMetrics(): Promise<string> {
  const [views, alerts] = await Promise.all([getServerViews(), storage.getActiveAlerts()]);
  return buildExposition(views, alerts);
}
