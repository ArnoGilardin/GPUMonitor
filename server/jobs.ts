import bcrypt from "bcrypt";
import { storage } from "./storage";
import { checkOfflineServers } from "./alerting";
import { events } from "./services/events";
import { config } from "./config";

/** Create the first admin and the default alert rules on an empty database. */
export async function bootstrap(): Promise<void> {
  if ((await storage.countUsers()) === 0) {
    let username = process.env.ADMIN_USERNAME;
    let password = process.env.ADMIN_PASSWORD;
    if ((!username || !password) && !config.isProduction) {
      username = "admin";
      password = "admin";
      console.warn("⚠️  No users found: created development admin account admin/admin");
    }
    if (username && password) {
      await storage.createUser({
        username,
        passwordHash: await bcrypt.hash(password, config.bcryptRounds),
        role: "admin",
      });
      console.log(`✅ Admin account "${username}" created`);
    } else {
      console.warn("⚠️  No users and no ADMIN_USERNAME/ADMIN_PASSWORD: the first account registered becomes admin");
    }
  }

  if ((await storage.countRules()) === 0) {
    const defaults = [
      { name: "GPU temperature high", type: "gpu_temp", threshold: "80", durationSec: 120, level: "warning" },
      { name: "GPU temperature critical", type: "gpu_temp", threshold: "90", durationSec: 60, level: "critical" },
      { name: "VRAM almost full", type: "vram_util", threshold: "95", durationSec: 300, level: "warning" },
      { name: "Disk almost full", type: "disk_util", threshold: "90", durationSec: 300, level: "warning" },
      { name: "RAM saturated", type: "ram_util", threshold: "95", durationSec: 300, level: "critical" },
      { name: "Server offline", type: "server_offline", threshold: "180", durationSec: 0, level: "critical" },
    ];
    for (const rule of defaults) await storage.createRule({ ...rule, enabled: true });
    console.log(`✅ Created ${defaults.length} default alert rules`);
  }
}

const timers: NodeJS.Timeout[] = [];

export function startBackgroundJobs(): void {
  // Offline detection + status refresh for dashboards
  let lastOnline = new Set<string>();
  timers.push(setInterval(async () => {
    await checkOfflineServers();
    try {
      const settings = await storage.getSettings();
      const offlineAfter = Number(settings.offline_after_sec) * 1000;
      const now = Date.now();
      const online = new Set(
        (await storage.listServers())
          .filter((s) => s.lastSeenAt && now - new Date(s.lastSeenAt).getTime() <= offlineAfter)
          .map((s) => s.id),
      );
      const changed = online.size !== lastOnline.size || Array.from(online).some((id) => !lastOnline.has(id));
      if (changed) events.emitEvent({ type: "servers" });
      lastOnline = online;
    } catch (error) {
      console.error("Status refresh error:", error);
    }
  }, 30_000));

  // Retention (hourly)
  const purge = async () => {
    try {
      const settings = await storage.getSettings();
      const result = await storage.purgeOldData(
        Number(settings.metrics_retention_days) || 30,
        Number(settings.alerts_retention_days) || 90,
      );
      await storage.cleanupExpiredTokens();
      if (result.snapshots || result.alerts) {
        console.log(`🧹 Retention: removed ${result.snapshots} snapshots and ${result.alerts} alerts`);
      }
    } catch (error) {
      console.error("Retention job error:", error);
    }
  };
  timers.push(setTimeout(purge, 60_000));
  timers.push(setInterval(purge, 3600_000));
}

export function stopBackgroundJobs(): void {
  timers.forEach((t) => clearInterval(t));
}
