import { RULE_TYPE_LABELS, type Rule, type RuleType } from "@shared/schema";

export interface LatestSample {
  sys?: {
    cpuPercent: number;
    ramPercent: number;
    diskPercent: number;
    load1: number;
  } | null;
  gpus: Array<{
    utilPercent: number;
    vramUsedMB: number;
    vramTotalMB: number;
    tempC: number;
    powerW: number;
  }>;
}

export interface RuleTarget {
  id: string;
  tags: string[] | null;
}

/** Whether a rule's scope (specific server or tag) includes the server. */
export function ruleAppliesTo(rule: Pick<Rule, "serverId" | "tag">, server: RuleTarget): boolean {
  if (rule.serverId && rule.serverId !== server.id) return false;
  if (rule.tag && !(server.tags || []).includes(rule.tag)) return false;
  return true;
}

/** The metric a rule watches, computed from the latest sample. undefined = no data. */
export function metricValue(type: RuleType, sample: LatestSample): number | undefined {
  const gpus = sample.gpus;
  switch (type) {
    case "gpu_temp":
      return gpus.length ? Math.max(...gpus.map((g) => g.tempC)) : undefined;
    case "gpu_util":
      return gpus.length ? gpus.reduce((s, g) => s + g.utilPercent, 0) / gpus.length : undefined;
    case "vram_util": {
      const withVram = gpus.filter((g) => g.vramTotalMB > 0);
      return withVram.length
        ? Math.max(...withVram.map((g) => (g.vramUsedMB / g.vramTotalMB) * 100))
        : undefined;
    }
    case "gpu_power":
      return gpus.length ? gpus.reduce((s, g) => s + g.powerW, 0) : undefined;
    case "cpu_util":
      return sample.sys?.cpuPercent;
    case "ram_util":
      return sample.sys?.ramPercent;
    case "disk_util":
      return sample.sys?.diskPercent;
    case "load1":
      return sample.sys?.load1;
    case "server_offline":
      return undefined; // evaluated by the offline watcher, not from samples
  }
}

export function formatValue(type: RuleType, value: number): string {
  const unit = RULE_TYPE_LABELS[type].unit;
  const rounded = Math.round(value * 10) / 10;
  return `${rounded}${unit}`;
}

export function alertMessage(rule: Pick<Rule, "type" | "threshold">, value: number): string {
  const type = rule.type as RuleType;
  const label = RULE_TYPE_LABELS[type]?.label ?? rule.type;
  if (type === "server_offline") {
    return `No data received for ${formatDuration(value)} (threshold ${formatDuration(Number(rule.threshold))})`;
  }
  return `${label} is ${formatValue(type, value)}, above threshold of ${formatValue(type, Number(rule.threshold))}`;
}

export function formatDuration(sec: number): string {
  if (sec < 90) return `${Math.round(sec)}s`;
  if (sec < 5400) return `${Math.round(sec / 60)}m`;
  if (sec < 172800) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

export type BreachDecision = "fire" | "pending" | "clear";

/**
 * Tracks how long each (server, rule) condition has been breached so that
 * a rule only fires once it has held for `durationSec`.
 * State is in memory: a restart only delays alerts by one duration window.
 */
export class BreachTracker {
  private since = new Map<string, number>();

  update(key: string, breached: boolean, durationSec: number, now = Date.now()): BreachDecision {
    if (!breached) {
      this.since.delete(key);
      return "clear";
    }
    let start = this.since.get(key);
    if (start === undefined) {
      start = now;
      this.since.set(key, start);
    }
    return now - start >= durationSec * 1000 ? "fire" : "pending";
  }

  forgetServer(serverId: string) {
    const prefix = `${serverId}:`;
    for (const key of Array.from(this.since.keys())) {
      if (key.startsWith(prefix)) this.since.delete(key);
    }
  }
}
