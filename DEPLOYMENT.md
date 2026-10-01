# GPU Monitor - Quick Deployment Guide

## Prerequisites

- Docker & Docker Compose installed
- NVIDIA drivers + nvidia-smi (for GPU monitoring)
- NVIDIA Container Toolkit (for GPU collectors)
- Ubuntu Server 20.04+ (recommended)

## Quick Start

### 1. Clone & Configure

```bash
# Clone repository
git clone https://github.com/your-repo/gpu-monitor.git
cd gpu-monitor

# Create environment file
cp .env.example .env

# IMPORTANT: Edit .env with secure values
nano .env
```

**Critical variables to set:**
```bash
# Generate with: openssl rand -hex 32
JWT_SECRET=<your-generated-secret>
REFRESH_TOKEN_SECRET=<your-generated-secret>
COLLECTOR_API_KEY=<your-generated-key>

# Database (generate with: openssl rand -base64 32)
POSTGRES_PASSWORD=<your-strong-password>

# Admin account
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<your-strong-admin-password>

# Your domain
FRONTEND_URL=https://your-domain.com
```

### 2. Deploy Central Server

```bash
# Start all services
docker compose up -d

# Check logs
docker compose logs -f

# Verify health
curl http://localhost:5100/health
```

**Services started:**
- Application (127.0.0.1:5100; pending database migrations are applied at startup)
- PostgreSQL (internal only, not exposed)
- Nginx (ports 80/443) - with `--profile production`
- Fleet simulator (6 fake GPU servers) - with `--profile demo`, handy for a first look

On first start the admin account from `ADMIN_USERNAME` / `ADMIN_PASSWORD` and a
set of default alert rules are created.

### 3. Add your GPU servers

For each machine:

1. In the dashboard, open **Servers → Add server**, give it a name and tags.
2. A **dedicated collector key** is displayed once, with ready-to-copy
   Docker / systemd / Python commands.
3. On the GPU machine, install the collector with that key:

```bash
git clone https://github.com/your-repo/gpu-monitor.git && cd gpu-monitor

# native install (systemd service, Python venv in /opt/gpu-monitor-collector)
sudo ./scripts/install_collector.sh --url https://your-monitor-domain.com --key gpm_xxx --id z620-gpu-01

# or as a container (NVIDIA Container Toolkit required for GPUs)
sudo ./scripts/install_collector.sh --docker --url https://your-monitor-domain.com --key gpm_xxx --id z620-gpu-01
```

The server switches from "Waiting for data" to "Online" within one interval (30 s).

**Auto-registration (alternative):** a collector started with the global
`COLLECTOR_API_KEY` registers its server by itself. Set
`REQUIRE_SERVER_KEYS=true` on the central server to allow per-server keys only.

```bash
# check a collector without installing anything
CENTRAL_API_URL=https://your-monitor-domain.com CENTRAL_API_KEY=gpm_xxx \
  python3 collector/collector.py --once     # prints OK when the report is accepted
python3 collector/collector.py --dry-run    # prints what would be sent
```

### 4. Access Dashboard

1. Open browser: `https://your-domain.com`
2. Login with admin credentials
3. Set the webhook (Slack/Discord/any URL) or email recipient in **Settings → Notifications**
   and use the test button
4. Adjust the default alert rules in **Settings → Alert rules** (rules can target all
   servers, a tag, or one server)
5. Create accounts for your team in **Settings → Users** (viewer or admin)

## Architecture

```
┌─────────────────────────────────────────┐
│ Nginx Reverse Proxy                     │
│ Ports: 80 (HTTP) / 443 (HTTPS)         │
└──────────────┬──────────────────────────┘
               │
               ↓
┌─────────────────────────────────────────┐
│ GPU Monitor Application                  │
│ Internal Port: 5100                      │
│ (exposed via Docker network only)        │
└──────────────┬──────────────────────────┘
               │
      ┌────────┴────────┐
      ↓                 ↓
┌─────────────┐  ┌─────────────┐
│ PostgreSQL  │  │   Redis     │
│ (internal)  │  │ (internal)  │
└─────────────┘  └─────────────┘

           ↑ HTTP POST /v1/ingest
           │ (API Key authenticated)
           │
┌─────────────────────────────────────────┐
│ GPU Collectors (on remote servers)      │
│ - nvidia-smi for GPU metrics            │
│ - psutil for system metrics             │
│ - Sends data every 30s                  │
└─────────────────────────────────────────┘
```

## Port Configuration

**External (exposed to host):**
- 80 (Nginx HTTP)
- 443 (Nginx HTTPS)

**Internal (Docker network only):**
- 5100 (Application)
- 5432 (PostgreSQL)
- 6379 (Redis)

**Why 5100?** Avoids conflicts with common services using 5000/8000.

## Prometheus / Grafana

Set `METRICS_TOKEN` in `.env`, restart, then add to `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: gpu-monitor
    scrape_interval: 30s
    scheme: https
    authorization:
      credentials: <METRICS_TOKEN>
    static_configs:
      - targets: ["your-monitor-domain.com"]
```

Main series: `gpumon_gpu_utilization_percent`, `gpumon_gpu_temperature_celsius`,
`gpumon_gpu_power_watts`, `gpumon_gpu_memory_used_bytes`, `gpumon_gpu_throttled`,
`gpumon_gpu_ecc_uncorrected_errors`, `gpumon_server_up`, `gpumon_alerts_active`
(labels `server`, `gpu`, `model`).

## Upgrading

```bash
git pull && docker compose up -d --build
```

Migrations run automatically (`DB_AUTO_MIGRATE=false` to run them yourself with
`npm run db:migrate`). Back up the database first (see Maintenance below).

## Troubleshooting

### Application won't start
```bash
# Check logs
docker compose logs gpu-monitor

# Common issues:
# - Missing environment variables
# - Database connection failed
# - Port already in use
```

### Database connection failed
```bash
# Check PostgreSQL is running
docker compose ps postgres

# Test connection
docker compose exec postgres psql -U gpumonitor -d gpu_monitor

# Check DATABASE_URL format
# Should be: postgresql://gpumonitor:password@postgres:5432/gpu_monitor
```

### Collector not sending data
```bash
# On collector machine
docker compose logs -f

# Verify nvidia-smi works
nvidia-smi

# Test API connectivity
curl -X POST https://your-domain.com/v1/ingest \
  -H "Content-Type: application/json" \
  -H "x-api-key: your-collector-key" \
  -d '{"server":{"id":"test","name":"test","tags":[]},"sys":{"cpuPercent":0,"ramPercent":0,"diskPercent":0,"load1":0,"uptimeSec":0},"gpus":[],"ts":"2024-01-01T00:00:00Z"}'
```

### HTTPS not working
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d your-domain.com

# Verify renewal
sudo certbot renew --dry-run
```

## Maintenance

### Backup Database
```bash
# Manual backup
docker compose exec postgres pg_dump -U gpumonitor gpu_monitor > backup_$(date +%Y%m%d).sql

# Automated daily backup (add to crontab)
0 2 * * * cd /opt/gpu-monitor && docker compose exec -T postgres pg_dump -U gpumonitor gpu_monitor > backups/backup_$(date +\%Y\%m\%d).sql
```

### Update Application
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
docker compose up -d --build

# Check status
docker compose ps
```

### View Logs
```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f gpu-monitor
docker compose logs -f postgres

# Last 100 lines
docker compose logs --tail=100 gpu-monitor
```

## Security Best Practices

✅ **Always:**
- Use strong, unique passwords
- Enable HTTPS with valid certificates
- Keep secrets out of git
- Rotate secrets every 90 days
- Enable firewall (ufw)
- Keep Docker images updated
- Review audit logs regularly

❌ **Never:**
- Expose PostgreSQL port to host
- Use default passwords
- Commit `.env` file
- Run without reverse proxy in production
- Disable rate limiting
- Skip security updates

## Support

- Documentation: See `SECURITY.md` for security guidelines
- Issues: Open GitHub issue
- Security: Contact security team directly (DO NOT open public issue)