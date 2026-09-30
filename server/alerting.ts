import type { Alert, Rule, RuleType, Server } from "@shared/schema";
import { storage } from "./storage";
import { sendEmail } from "./sendgrid";
import { events } from "./services/events";
import { BreachTracker, alertMessage, metricValue, ruleAppliesTo, type LatestSample } from "./services/rules-engine";

const tracker = new BreachTracker();

/** Evaluate every metric rule for one server right after it reported. */
export async function checkAlerts(server: Server, sample: LatestSample): Promise<void> {
  try {
    const activeRules = await storage.getActiveRules();

    for (const rule of activeRules) {
      if (!ruleAppliesTo(rule, server)) continue;
      const key = `${server.id}:${rule.id}`;

      if (rule.type === "server_offline") {
        // The server just reported, so any offline alert is over
        tracker.update(key, false, 0);
        await resolveIfActive(server, rule, "auto");
        continue;
      }

      const value = metricValue(rule.type as RuleType, sample);
      const breached = value !== undefined && value >= Number(rule.threshold);
      const decision = server.maintenance ? "clear" : tracker.update(key, breached, rule.durationSec);

      if (decision === "fire" && value !== undefined) {
        await fireIfNew(server, rule, value);
      } else if (decision === "clear") {
        await resolveIfActive(server, rule, "auto");
      }
    }
  } catch (error) {
    console.error("Alert checking error:", error);
  }
}

/** Periodic check for servers that stopped reporting. */
export async function checkOfflineServers(): Promise<void> {
  try {
    const offlineRules = (await storage.getActiveRules()).filter((r) => r.type === "server_offline");
    if (!offlineRules.length) return;
    const serverList = await storage.listServers();
    const now = Date.now();

    for (const server of serverList) {
      if (!server.lastSeenAt || server.maintenance) continue;
      const silentSec = (now - new Date(server.lastSeenAt).getTime()) / 1000;
      for (const rule of offlineRules) {
        if (!ruleAppliesTo(rule, server)) continue;
        if (silentSec >= Number(rule.threshold)) {
          await fireIfNew(server, rule, silentSec);
        }
      }
    }
  } catch (error) {
    console.error("Offline check error:", error);
  }
}

export function forgetServer(serverId: string) {
  tracker.forgetServer(serverId);
}

async function fireIfNew(server: Server, rule: Rule, value: number) {
  const existing = await storage.getActiveAlert(server.id, rule.id);
  if (existing) return;

  const message = alertMessage(rule, value);
  const alert = await storage.createAlert({
    serverId: server.id,
    ruleId: rule.id,
    level: rule.level,
    message,
    value: value.toFixed(2),
  });
  events.emitEvent({ type: "alert", action: "fired", alertId: alert.id, serverId: server.id, level: alert.level, message, serverName: server.name });

  sendNotifications({ kind: "fired", alert, rule, serverName: server.name }).catch((err) =>
    console.error(`Failed to send notifications for alert ${alert.id}:`, err.message),
  );
}

async function resolveIfActive(server: Server, rule: Rule, by: string) {
  const existing = await storage.getActiveAlert(server.id, rule.id);
  if (!existing) return;
  const resolved = await storage.resolveAlert(existing.id, by);
  if (!resolved) return;
  events.emitEvent({ type: "alert", action: "resolved", alertId: resolved.id, serverId: server.id, level: resolved.level, message: resolved.message, serverName: server.name });

  const settings = await storage.getSettings();
  if (settings.notify_on_resolve === "true") {
    sendNotifications({ kind: "resolved", alert: resolved, rule, serverName: server.name }).catch((err) =>
      console.error(`Failed to send resolve notification for alert ${resolved.id}:`, err.message),
    );
  }
}

// --------------------------------------------------------------- notifications

export interface NotificationPayload {
  kind: "fired" | "resolved" | "test";
  alert: Pick<Alert, "level" | "message" | "value" | "firedAt">;
  rule?: Pick<Rule, "name" | "threshold">;
  serverName: string;
}

/** Build a webhook body adapted to the destination (Slack, Discord or generic JSON). */
export function buildWebhookBody(url: string, n: NotificationPayload): unknown {
  const emoji = n.kind === "resolved" ? "✅" : n.alert.level === "critical" ? "🔴" : "🟠";
  const title = n.kind === "resolved"
    ? `Resolved: ${n.rule?.name ?? "alert"} on ${n.serverName}`
    : `${n.alert.level.toUpperCase()}: ${n.rule?.name ?? "alert"} on ${n.serverName}`;
  const text = `${emoji} *${title}*\n${n.alert.message}`;

  if (url.includes("hooks.slack.com")) {
    return { text };
  }
  if (url.includes("discord.com/api/webhooks") || url.includes("discordapp.com/api/webhooks")) {
    return {
      embeds: [{
        title: `${emoji} ${title}`,
        description: n.alert.message,
        color: n.kind === "resolved" ? 0x22c55e : n.alert.level === "critical" ? 0xef4444 : 0xf59e0b,
        timestamp: new Date().toISOString(),
      }],
    };
  }
  return {
    event: n.kind,
    server: n.serverName,
    level: n.alert.level,
    rule: n.rule?.name,
    message: n.alert.message,
    threshold: n.rule ? Number(n.rule.threshold) : undefined,
    value: n.alert.value !== null && n.alert.value !== undefined ? Number(n.alert.value) : undefined,
    text,
    timestamp: new Date().toISOString(),
  };
}

export async function sendWebhook(url: string, n: NotificationPayload): Promise<void> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildWebhookBody(url, n)),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Webhook returned HTTP ${response.status}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendAlertEmail(to: string, n: NotificationPayload): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) {
    throw new Error("SENDGRID_API_KEY is not configured");
  }
  const subject = n.kind === "resolved"
    ? `[RESOLVED] ${n.serverName}: ${n.rule?.name ?? "alert"}`
    : `[${n.alert.level.toUpperCase()}] ${n.serverName}: ${n.rule?.name ?? "alert"}`;
  const html = `
    <h2>GPU Monitor ${n.kind === "resolved" ? "- alert resolved" : "alert"}</h2>
    <p><strong>Server:</strong> ${escapeHtml(n.serverName)}</p>
    <p><strong>Level:</strong> ${escapeHtml(n.alert.level.toUpperCase())}</p>
    <p><strong>Message:</strong> ${escapeHtml(n.alert.message)}</p>
    <p><strong>Time:</strong> ${new Date().toISOString()}</p>`;
  const ok = await sendEmail(process.env.SENDGRID_API_KEY, {
    to,
    from: process.env.SENDGRID_FROM_EMAIL || "alerts@gpu-monitor.local",
    subject,
    html,
  });
  if (!ok) throw new Error(`Email to ${to} failed`);
}

async function sendNotifications(n: NotificationPayload): Promise<void> {
  const settings = await storage.getSettings();
  const errors: string[] = [];

  if (settings.alert_email_to && process.env.SENDGRID_API_KEY) {
    await sendAlertEmail(settings.alert_email_to, n).catch((e) => errors.push(e.message));
  }
  if (settings.webhook_url) {
    await sendWebhook(settings.webhook_url, n).catch((e) => errors.push(e.message));
  }
  if (errors.length) throw new Error(errors.join("; "));
}
