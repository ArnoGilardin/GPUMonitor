# Security Guidelines for GPU Monitor

## 🔒 Pre-Deployment Security Checklist

Before deploying to production, ensure you complete ALL the following steps:

### 1. Generate Strong Secrets

**CRITICAL**: Never use default or example values in production!

```bash
# Generate all required secrets
openssl rand -hex 32  # For JWT_SECRET
openssl rand -hex 32  # For REFRESH_TOKEN_SECRET  
openssl rand -hex 24  # For COLLECTOR_API_KEY
openssl rand -base64 32  # For POSTGRES_PASSWORD
```

### 2. Create Production Environment File

```bash
# Copy example file
cp .env.example .env

# Edit with your secure values
nano .env

# Set restrictive permissions
chmod 600 .env
```

### 3. Change Admin Credentials

In your `.env` file, set a strong admin password:
```bash
ADMIN_USERNAME=admin
ADMIN_PASSWORD=YourVeryStrongPasswordHere123!@#
```

**Password Requirements:**
- Minimum 16 characters
- Mix of uppercase, lowercase, numbers, symbols
- Use a password manager

### 4. Database Security

✅ **Already configured securely:**
- PostgreSQL is NOT exposed to host (internal Docker network only)
- No port mapping to 5432
- Only accessible via Docker network

✅ **You must do:**
- Set strong `POSTGRES_PASSWORD` in `.env`
- Change default `POSTGRES_USER` from `postgres` to something unique
- Enable PostgreSQL SSL if accessible over network

### 5. HTTPS/TLS Configuration

The application is designed to run behind a reverse proxy (Nginx, Caddy, Traefik).

**For Nginx with Let's Encrypt:**
```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d your-domain.com

# Auto-renewal is configured automatically
```

**Required in production:**
- Valid SSL/TLS certificate
- HTTPS enforcement (HTTP → HTTPS redirect)
- Set `TRUST_PROXY=true` in `.env`

### 6. Firewall Configuration

```bash
# Allow only necessary ports
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP (for Let's Encrypt)
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

**DO NOT expose:**
- Port 5100 (application - published on 127.0.0.1 only, put a reverse proxy in front)
- Port 5432 (PostgreSQL - Docker internal only)

### 7. Collector Security

On each collector machine:

```bash
# Create .env file
cd /opt/gpu-collector
cp .env.example .env
nano .env
```

**Required settings:**
```bash
CENTRAL_API_URL=https://your-secure-domain.com  # Use HTTPS!
CENTRAL_API_KEY=YourCollectorAPIKeyFromServerEnv
SERVER_ID=unique-server-id
```

**Security notes:**
- Use HTTPS for `CENTRAL_API_URL` in production
- Keep `CENTRAL_API_KEY` secret and identical to server's `COLLECTOR_API_KEY`
- Collectors don't expose any ports (push-only communication)

## 🛡️ Ongoing Security Practices

### Regular Updates

```bash
# Update Docker images monthly
docker compose pull
docker compose up -d

# Update host system
sudo apt update && sudo apt upgrade -y
```

### Monitoring

- Enable audit logging for security events (built-in)
- Monitor failed login attempts
- Set up alerts for unauthorized API access attempts
- Review security audit logs: `docker compose logs gpu-monitor | grep security`

### Backup Security

```bash
# Automated backup script
cat > /opt/gpu-monitor/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/gpu-monitor/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create encrypted backup
docker compose exec -T postgres pg_dump -U gpumonitor gpu_monitor | \
  gpg --symmetric --cipher-algo AES256 > \
  "$BACKUP_DIR/backup_$TIMESTAMP.sql.gpg"

# Keep only last 30 days
find "$BACKUP_DIR" -name "backup_*.sql.gpg" -mtime +30 -delete
EOF

chmod +x /opt/gpu-monitor/backup.sh

# Add to crontab
crontab -e
# Add: 0 2 * * * /opt/gpu-monitor/backup.sh
```

### Secret Rotation

Rotate secrets every 90 days:

1. Generate new secrets
2. Update `.env` on server
3. Restart services: `docker compose restart`
4. Update collector `.env` files
5. Restart collectors

## 🚨 Security Incident Response

If you suspect a security breach:

1. **Immediate Actions:**
   ```bash
   # Rotate all secrets immediately
   # Stop all services
   docker compose down
   
   # Review audit logs
   docker compose logs gpu-monitor > incident_$(date +%Y%m%d).log
   
   # Check for unauthorized access
   grep "failed_login\|unauthorized" incident_*.log
   ```

2. **Revoke Compromised Credentials:**
   - Change admin password
   - Rotate JWT secrets (invalidates all sessions)
   - Rotate collector API keys
   - Update database password

3. **Investigate:**
   - Review security audit logs
   - Check for suspicious API calls
   - Verify collector authenticity
   - Examine database for unauthorized changes

4. **Recovery:**
   - Restore from encrypted backup if needed
   - Update all secrets
   - Notify affected users
   - Implement additional monitoring

## 📋 Security Features Built-In

✅ **Authentication & Authorization:**
- JWT tokens with refresh mechanism
- Bcrypt password hashing (12 rounds)
- Role-based access control (admin/viewer)
- Refresh tokens stored server-side and revocable (logout, password reset)
- Public registration disabled by default (`ALLOW_REGISTRATION`)
- Secrets required at startup in production

✅ **API Security:**
- Rate limiting (3000 req/15min per IP on /api, 120 req/min per collector key and IP)
- Per-server collector keys (SHA-256 hashed, shown once, rotatable); a keyed server
  refuses the global key, and `REQUIRE_SERVER_KEYS=true` disables the global key entirely
- Constant-time key comparison, input validation with zod on every endpoint
- CORS protection
- Helmet security headers
- Input validation (Zod schemas)

✅ **Network Security:**
- Internal Docker network for services
- No database exposure to host
- Designed for reverse proxy deployment
- WebSocket authentication

✅ **Audit & Monitoring:**
- Security audit log for all auth events
- Failed login tracking
- API key usage logging
- Refresh token tracking

## 📞 Security Contact

Report security vulnerabilities to: [your-security-email@domain.com]

**Do not** open public GitHub issues for security vulnerabilities.