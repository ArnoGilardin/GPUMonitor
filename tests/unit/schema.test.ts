import { describe, it, expect } from "vitest";
import { createServerSchema, ingestPayloadSchema, ruleInputSchema, updateSettingsSchema } from "@shared/schema";
import { buildWebhookBody } from "../../server/alerting";

describe("ingestPayloadSchema", () => {
  const legacy = {
    server: { id: "gpu-01", name: "GPU 01", tags: ["x"] },
    sys: { cpuPercent: 1, ramPercent: 2, diskPercent: 3, load1: 0.5, uptimeSec: 10 },
    gpus: [{ gpuIndex: 0, vendor: "nvidia", utilPercent: 1, vramUsedMB: 1, vramTotalMB: 2, tempC: 40, powerW: 50, fanPercent: 0, driverVersion: "550" }],
    ts: "2024-01-01T00:00:00Z",
  };
  it("accepts payloads from v1 collectors", () => {
    expect(ingestPayloadSchema.safeParse(legacy).success).toBe(true);
  });
  it("rejects unsafe server ids", () => {
    expect(ingestPayloadSchema.safeParse({ ...legacy, server: { ...legacy.server, id: "../etc" } }).success).toBe(false);
  });
  it("rejects non-finite numbers", () => {
    const bad = { ...legacy, sys: { ...legacy.sys, cpuPercent: Infinity } };
    expect(ingestPayloadSchema.safeParse(bad).success).toBe(false);
  });
});

describe("input schemas", () => {
  it("validates rules", () => {
    expect(ruleInputSchema.safeParse({ name: "x", type: "gpu_temp", threshold: "80", durationSec: "60", level: "warning" }).success).toBe(true);
    expect(ruleInputSchema.safeParse({ name: "x", type: "nope", threshold: 1, durationSec: 1, level: "warning" }).success).toBe(false);
  });
  it("validates servers", () => {
    expect(createServerSchema.parse({ name: " A " }).name).toBe("A");
    expect(createServerSchema.safeParse({ name: "A", id: "has space" }).success).toBe(false);
  });
  it("validates settings", () => {
    expect(updateSettingsSchema.safeParse({ webhook_url: "javascript:alert(1)" }).success).toBe(false);
    expect(updateSettingsSchema.safeParse({ webhook_url: "" }).success).toBe(true);
    expect(updateSettingsSchema.parse({ offline_after_sec: 300 }).offline_after_sec).toBe("300");
    expect(updateSettingsSchema.safeParse({ offline_after_sec: 5 }).success).toBe(false);
  });
});

describe("buildWebhookBody", () => {
  const n = { kind: "fired" as const, alert: { level: "critical", message: "Hot", value: "91", firedAt: new Date() }, rule: { name: "Temp", threshold: "90" }, serverName: "gpu-01" };
  it("formats Slack messages", () => {
    const body = buildWebhookBody("https://hooks.slack.com/services/x", n) as any;
    expect(body.text).toContain("CRITICAL: Temp on gpu-01");
  });
  it("formats Discord embeds", () => {
    const body = buildWebhookBody("https://discord.com/api/webhooks/1/abc", n) as any;
    expect(body.embeds[0].description).toBe("Hot");
  });
  it("sends generic JSON elsewhere", () => {
    const body = buildWebhookBody("https://example.com/hook", n) as any;
    expect(body).toMatchObject({ event: "fired", server: "gpu-01", level: "critical", value: 91, threshold: 90 });
  });
});
