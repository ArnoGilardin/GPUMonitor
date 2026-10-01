import type { MaintenanceWindow } from "@shared/schema";
import { storage } from "../storage";
import { ruleAppliesTo, type RuleTarget } from "./rules-engine";

// Ingest calls this on every report: keep the active windows in memory briefly
const TTL_MS = 15_000;
let cache: { at: number; windows: MaintenanceWindow[] } | null = null;

export async function getActiveWindows(): Promise<MaintenanceWindow[]> {
  const now = Date.now();
  if (cache && now - cache.at < TTL_MS) {
    // a cached window may have ended (or started) since it was loaded
    return cache.windows.filter((w) => w.startsAt.getTime() <= now && w.endsAt.getTime() >= now);
  }
  // load windows starting within the TTL too, so they apply on time
  const windows = await storage.getActiveMaintenanceWindows(new Date(now), new Date(now + TTL_MS));
  cache = { at: now, windows };
  return windows.filter((w) => w.startsAt.getTime() <= now && w.endsAt.getTime() >= now);
}

export function invalidateWindows() {
  cache = null;
}

/** The active window covering this server (scoped like alert rules: all, tag or server). */
export function windowFor(server: RuleTarget, windows: MaintenanceWindow[]): MaintenanceWindow | undefined {
  return windows.find((w) => ruleAppliesTo(w, server));
}
