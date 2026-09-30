# GPU Monitor

Self-hosted monitoring for fleets of GPU servers: live dashboard, per-GPU
history, alerting with Slack/Discord/email notifications, and a lightweight
Python collector for NVIDIA and AMD GPUs.

![stack](https://img.shields.io/badge/stack-React%20%7C%20Express%20%7C%20PostgreSQL%20%7C%20Python-blue)

## Features

- **Multi-server fleet view**: status of every server at a glance (online, warning,
  critical, offline, waiting for first report, maintenance), per-GPU utilization bars,
  filters by status and tag, search, sorting by load / temperature / power.
- **Server management from the UI**: add a server, get a dedicated collector key and
  copy-paste install commands (Docker, systemd, Python), edit name/tags/location, rotate
  keys, maintenance mode (mutes alerts), delete.
- **Per-server history**: GPU utilization, temperature, VRAM and power per GPU, CPU/RAM/disk,
  network traffic, over 1 h to 30 days (automatically downsampled), CSV export.
- **Alerting that behaves**: rules on GPU temperature, utilization, VRAM, power, CPU, RAM,
  disk, load or *server offline*; a rule fires only after its condition held for its
  duration, resolves itself when the condition clears, and can target all servers, a tag
  or a single server. Alerts can be acknowledged or resolved by hand.
- **Notifications**: Slack and Discord (formatted), any JSON webhook, email via SendGrid,
  on fire and on resolve, with test buttons.
- **Real time**: WebSocket push, the UI refreshes as soon as a collector reports.
- **Users & security**: admin / viewer roles, user management, password change, JWT with
  refresh tokens, rate limiting, security audit log, per-server hashed API keys.
- **Retention**: metrics and resolved alerts are purged automatically (configurable).
- **Collector**: NVIDIA (`nvidia-smi`) and AMD (`rocm-smi`) GPUs with model names and
  UUIDs, system metrics, host info; buffers reports while the central server is
  unreachable and keeps retrying.

## Quick start (development)

Requirements: Node 20+, PostgreSQL 14+, Python 3.8+ for the collector.

```bash
npm install
export DATABASE_URL=postgresql://user:pass@localhost:5432/gpu_monitor
npm run db:push          # create / update the schema
npm run dev              # http://localhost:5100 - login admin / admin (created on an empty database)

# in another terminal: 6 fake GPU servers reporting every 10 s
npm run simulate -- --servers 6 --interval 10
```

## Production

```bash
cp .env.example .env     # set the secrets, admin account and domain
docker compose up -d                       # app + PostgreSQL
docker compose --profile production up -d  # + nginx with TLS (see nginx.conf)
docker compose --profile demo up -d        # + simulated servers, for a first look
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for details and [SECURITY.md](SECURITY.md) for the
security model.

## Adding GPU servers

1. **Servers → Add server** in the web UI. Copy the key shown (it is displayed once).
2. On the GPU machine:

   ```bash
   sudo ./scripts/install_collector.sh --url https://monitor.example.com --key gpm_xxx
   # or --docker to run it as a container
   ```

3. The server appears as *Online* after its first report (30 s by default).

Collectors started with the global `COLLECTOR_API_KEY` register their server
automatically instead. `REQUIRE_SERVER_KEYS=true` disables that.

## Architecture

```
 GPU server                    Central server                         Browser
┌───────────────┐  HTTPS POST ┌────────────────────────────────┐ REST ┌─────────────┐
│ collector.py  │ ──────────▶ │ Express API  /v1/ingest        │◀────▶│ React app   │
│ nvidia-smi    │  x-api-key  │  ├─ rules engine → alerts      │  WS  │ (Vite,      │
│ rocm-smi      │             │  ├─ notifications (webhook,    │─────▶│  TanStack   │
│ psutil        │             │  │   email)                     │      │  Query)     │
└───────────────┘             │  └─ jobs: offline, retention   │      └─────────────┘
                              │ PostgreSQL (Drizzle ORM)       │
                              └────────────────────────────────┘
```

| Path | Content |
| --- | --- |
| `shared/schema.ts` | Database schema, validation schemas and API types shared by server and client |
| `server/routes.ts` | REST API |
| `server/alerting.ts`, `server/services/rules-engine.ts` | Rule evaluation, alert lifecycle, notifications |
| `server/services/fleet.ts` | Server status and fleet statistics |
| `server/jobs.ts` | First-run bootstrap, offline detection, retention |
| `client/src/pages` | Dashboard, Servers, Server details, Alerts, Settings |
| `collector/` | Python collector, Dockerfile, tests |
| `scripts/simulate.ts` | Fleet simulator |

### API overview

| Method | Path | Role |
| --- | --- | --- |
| `POST` | `/v1/ingest` | collector key |
| `GET` | `/api/servers`, `/api/servers/:id`, `/api/servers/:id/metrics?hours=` | viewer |
| `POST/PATCH/DELETE` | `/api/servers[/:id]`, `POST /api/servers/:id/rotate-key` | admin |
| `GET` | `/api/servers/:id/export.csv?hours=` | viewer |
| `GET` | `/api/alerts?status=active\|resolved\|all&serverId=` | viewer |
| `PATCH` | `/api/alerts/:id/acknowledge` (viewer), `/api/alerts/:id/resolve` (admin) | |
| `GET/POST/PATCH/DELETE` | `/api/rules[/:id]` | read: viewer, write: admin |
| `GET/PATCH` | `/api/settings`, `POST /api/settings/test-webhook`, `/test-email` | read: viewer, write: admin |
| `GET/POST/PATCH/DELETE` | `/api/users[/:id]`, `GET /api/audit-log` | admin |
| `GET` | `/api/stats`, `/api/tags`, `/health` | viewer / public |

## Tests

```bash
npm test                                        # unit tests (vitest)
cd collector && python3 -m unittest test_collector
npx playwright test                             # end-to-end, against the dev server
npm run check                                   # TypeScript
```

## Roadmap

See [ROADMAP.md](ROADMAP.md).
