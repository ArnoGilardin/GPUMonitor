#!/usr/bin/env tsx
/**
 * GPU Monitor - fleet simulator
 *
 * Sends realistic metrics for several fake GPU servers to /v1/ingest, so the
 * dashboard can be tried without real hardware.
 *
 *   npm run simulate -- --servers 8 --interval 10
 *   npm run simulate -- --url http://localhost:5100 --key collector-key-123 --hot 2
 *
 * Options:
 *   --servers N    number of servers (default 6)
 *   --interval S   seconds between reports (default 10)
 *   --url URL      central API (default $CENTRAL_API_URL or http://localhost:5100)
 *   --key KEY      collector key (default $CENTRAL_API_KEY or collector-key-123)
 *   --hot N        number of servers running hot, to trigger alerts (default 1)
 *   --once         send one report per server and exit
 */

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) args[a.slice(2)] = true;
    else { args[a.slice(2)] = next; i++; }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const SERVER_COUNT = Number(args.servers ?? 6);
const INTERVAL = Number(args.interval ?? 10);
const URL_BASE = String(args.url ?? process.env.CENTRAL_API_URL ?? "http://localhost:5100").replace(/\/$/, "");
const KEY = String(args.key ?? process.env.CENTRAL_API_KEY ?? "collector-key-123");
const HOT = Number(args.hot ?? 1);

const GPU_MODELS = [
  { name: "NVIDIA H100 80GB HBM3", vendor: "nvidia" as const, vram: 81559, tdp: 700 },
  { name: "NVIDIA A100-SXM4-40GB", vendor: "nvidia" as const, vram: 40960, tdp: 400 },
  { name: "NVIDIA GeForce RTX 4090", vendor: "nvidia" as const, vram: 24564, tdp: 450 },
  { name: "NVIDIA L40S", vendor: "nvidia" as const, vram: 46068, tdp: 350 },
  { name: "AMD Instinct MI250X", vendor: "amd" as const, vram: 65536, tdp: 500 },
];
const SITES = ["paris", "lyon", "frankfurt", "amsterdam"];
const ROLES = ["training", "inference", "render", "research"];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const drift = (v: number, step: number, lo: number, hi: number) => clamp(v + (Math.random() - 0.5) * 2 * step, lo, hi);

interface SimGpu { util: number; vramPct: number; temp: number; model: typeof GPU_MODELS[number] }
interface SimServer {
  id: string; name: string; tags: string[]; hot: boolean; cores: number;
  cpu: number; ram: number; disk: number; boot: number; gpus: SimGpu[];
}

const fleet: SimServer[] = Array.from({ length: SERVER_COUNT }, (_, i) => {
  const model = GPU_MODELS[i % GPU_MODELS.length];
  const gpuCount = [8, 4, 2, 8, 4, 1][i % 6];
  const site = SITES[i % SITES.length];
  const hot = i < HOT;
  return {
    id: `sim-gpu-${String(i + 1).padStart(2, "0")}`,
    name: `${site}-gpu-${String(i + 1).padStart(2, "0")}`,
    tags: [site, ROLES[i % ROLES.length], "simulated"],
    hot,
    cores: [64, 128, 32, 96][i % 4],
    cpu: 20 + Math.random() * 30,
    ram: 30 + Math.random() * 40,
    disk: 40 + Math.random() * 40,
    boot: Date.now() / 1000 - Math.random() * 30 * 86400,
    gpus: Array.from({ length: gpuCount }, () => ({
      util: hot ? 95 : 30 + Math.random() * 50,
      vramPct: 30 + Math.random() * 50,
      temp: hot ? 86 : 55 + Math.random() * 15,
      model,
    })),
  };
});

function tick(s: SimServer) {
  s.cpu = drift(s.cpu, 8, 2, 100);
  s.ram = drift(s.ram, 3, 10, 99);
  s.disk = clamp(s.disk + Math.random() * 0.02, 0, 99);
  for (const g of s.gpus) {
    g.util = s.hot ? drift(g.util, 3, 88, 100) : drift(g.util, 12, 0, 100);
    g.vramPct = drift(g.vramPct, 4, 5, 99);
    // temperature follows utilization with inertia
    const target = 35 + g.util * (s.hot ? 0.58 : 0.45);
    g.temp = clamp(g.temp + (target - g.temp) * 0.3 + (Math.random() - 0.5) * 2, 30, 99);
  }
  return {
    server: { id: s.id, name: s.name, tags: s.tags },
    host: {
      hostname: s.name,
      os: "Ubuntu 22.04.4 LTS",
      cpuModel: "AMD EPYC 7763 64-Core Processor",
      cpuCores: s.cores,
      collectorVersion: "sim-1.0",
    },
    sys: {
      cpuPercent: round(s.cpu),
      ramPercent: round(s.ram),
      diskPercent: round(s.disk),
      load1: round((s.cpu / 100) * s.cores * 0.8),
      load5: round((s.cpu / 100) * s.cores * 0.75),
      load15: round((s.cpu / 100) * s.cores * 0.7),
      ramTotalMB: 512 * 1024,
      ramUsedMB: Math.round((s.ram / 100) * 512 * 1024),
      diskTotalGB: 3840,
      diskUsedGB: round((s.disk / 100) * 3840),
      netRxBps: Math.round(Math.random() * 400e6),
      netTxBps: Math.round(Math.random() * 150e6),
      uptimeSec: Math.round(Date.now() / 1000 - s.boot),
    },
    gpus: s.gpus.map((g, i) => ({
      gpuIndex: i,
      vendor: g.model.vendor,
      name: g.model.name,
      uuid: `GPU-${s.id}-${i}`,
      utilPercent: round(g.util),
      vramTotalMB: g.model.vram,
      vramUsedMB: Math.round((g.vramPct / 100) * g.model.vram),
      tempC: round(g.temp),
      powerW: round(60 + (g.util / 100) * (g.model.tdp - 60) * (0.9 + Math.random() * 0.1)),
      fanPercent: round(clamp(20 + (g.temp - 40) * 1.5, 0, 100)),
      driverVersion: g.model.vendor === "nvidia" ? "550.54.15" : "6.7.0",
    })),
    ts: new Date().toISOString(),
  };
}

function round(v: number) {
  return Math.round(v * 10) / 10;
}

async function send(s: SimServer) {
  try {
    const res = await fetch(`${URL_BASE}/v1/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": KEY },
      body: JSON.stringify(tick(s)),
    });
    if (!res.ok) console.error(`✗ ${s.name}: HTTP ${res.status} ${await res.text()}`);
    return res.ok;
  } catch (e: any) {
    console.error(`✗ ${s.name}: ${e.message}`);
    return false;
  }
}

async function round_() {
  const results = await Promise.all(fleet.map(send));
  const ok = results.filter(Boolean).length;
  console.log(`${new Date().toLocaleTimeString()}  sent ${ok}/${fleet.length} reports`);
}

console.log(`Simulating ${fleet.length} servers (${fleet.reduce((n, s) => n + s.gpus.length, 0)} GPUs) → ${URL_BASE} every ${INTERVAL}s`);
await round_();
if (!args.once) setInterval(round_, INTERVAL * 1000);
