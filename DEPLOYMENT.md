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
SESSION_SECRET=<your-generated-secret>
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
- Application (internal port 5100)
- PostgreSQL (internal only, not exposed)
- Redis (internal only, not exposed)
- Nginx (ports 80/443) - if using production profile

### 3. Setup Collectors (on GPU machines)

```bash
# On each GPU server
cd /opt
git clone https://github.com/your-repo/gpu-monitor.git gpu-collector
cd gpu-collector/collector

# Configure
cp .env.example .env
nano .env
```

**Collector .env:**
```bash
CENTRAL_API_URL=https://your-monitor-domain.com
CENTRAL_API_KEY=<same-as-server-COLLECTOR_API_KEY>
SERVER_ID=z620-gpu-01
SERVER_NAME=Z620 Production
SERVER_TAGS=gpu,production,z620
```

```bash
# Start collector
docker compose up -d

# Check logs
docker compose logs -f
```

### 4. Access Dashboard

1. Open browser: `https://your-domain.com`
2. Login with admin credentials
3. Configure alerts in Settings
4. Verify collectors appear in dashboard

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