#!/usr/bin/env bash
# GPU Monitor collector installer (Linux, systemd).
#
#   sudo ./scripts/install_collector.sh --url https://monitor.example.com --key gpm_xxx [--id my-server] [--name "My server"] [--tags a,b] [--interval 30]
#   sudo ./scripts/install_collector.sh --docker --url ... --key ...     # run as a Docker container instead
#   sudo ./scripts/install_collector.sh --uninstall
#
# Missing values are asked interactively. An existing /etc/gpu-monitor/collector.env is reused.
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR=/opt/gpu-monitor-collector
ENV_FILE=/etc/gpu-monitor/collector.env
SERVICE=gpu-monitor-collector

MODE=systemd
URL="${CENTRAL_API_URL:-}"; KEY="${CENTRAL_API_KEY:-}"; ID="${SERVER_ID:-}"; NAME="${SERVER_NAME:-}"
TAGS="${SERVER_TAGS:-}"; INTERVAL="${INTERVAL_SEC:-30}"

green() { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[1;33m%s\033[0m\n' "$*"; }
die() { printf '\033[0;31m%s\033[0m\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) URL="$2"; shift 2 ;;
    --key) KEY="$2"; shift 2 ;;
    --id) ID="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --tags) TAGS="$2"; shift 2 ;;
    --interval) INTERVAL="$2"; shift 2 ;;
    --docker) MODE=docker; shift ;;
    --systemd) MODE=systemd; shift ;;
    --uninstall) MODE=uninstall; shift ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) die "Unknown option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Please run as root (sudo)."

if [[ "$MODE" == uninstall ]]; then
  systemctl disable --now "$SERVICE" 2>/dev/null || true
  rm -f "/etc/systemd/system/$SERVICE.service"
  systemctl daemon-reload || true
  docker rm -f "$SERVICE" 2>/dev/null || true
  rm -rf "$INSTALL_DIR"
  green "Collector removed (configuration kept in $ENV_FILE)."
  exit 0
fi

# Reuse an existing configuration
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
  URL="${URL:-${CENTRAL_API_URL:-}}"; KEY="${KEY:-${CENTRAL_API_KEY:-}}"; ID="${ID:-${SERVER_ID:-}}"
  NAME="${NAME:-${SERVER_NAME:-}}"; TAGS="${TAGS:-${SERVER_TAGS:-}}"
fi

[[ -n "$URL" ]] || read -rp "Central API URL (e.g. https://monitor.example.com): " URL
if [[ -z "$KEY" ]]; then read -rsp "Collector API key: " KEY; echo; fi
ID="${ID:-$(hostname -s)}"
NAME="${NAME:-$ID}"
[[ -n "$URL" && -n "$KEY" ]] || die "URL and key are required."

mkdir -p "$(dirname "$ENV_FILE")"
umask 077
cat > "$ENV_FILE" <<CONF
CENTRAL_API_URL=$URL
CENTRAL_API_KEY=$KEY
SERVER_ID=$ID
SERVER_NAME="$NAME"
SERVER_TAGS="$TAGS"
INTERVAL_SEC=$INTERVAL
CONF
umask 022
green "Configuration written to $ENV_FILE"

if command -v nvidia-smi >/dev/null; then green "NVIDIA GPUs detected: $(nvidia-smi -L | wc -l)"; fi
if command -v rocm-smi >/dev/null; then green "rocm-smi detected (AMD GPUs)"; fi

if [[ "$MODE" == docker ]]; then
  command -v docker >/dev/null || die "Docker is not installed."
  docker build -t gpu-monitor-collector:latest "$REPO_DIR/collector"
  GPU_FLAGS=()
  if command -v nvidia-smi >/dev/null; then GPU_FLAGS=(--gpus all); fi
  docker rm -f "$SERVICE" 2>/dev/null || true
  docker run -d --name "$SERVICE" --restart unless-stopped --network host --pid host \
    --env-file "$ENV_FILE" "${GPU_FLAGS[@]}" gpu-monitor-collector:latest
  green "Collector container started. Logs: docker logs -f $SERVICE"
  exit 0
fi

command -v python3 >/dev/null || die "python3 is required (apt install python3 python3-venv)."
id gpu-monitor >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin gpu-monitor
# Some systems restrict GPU device access to the video/render groups
for g in video render; do getent group "$g" >/dev/null && usermod -aG "$g" gpu-monitor; done
chgrp gpu-monitor "$ENV_FILE" && chmod 640 "$ENV_FILE"

mkdir -p "$INSTALL_DIR"
install -m 644 "$REPO_DIR/collector/collector.py" "$REPO_DIR/collector/requirements.txt" "$INSTALL_DIR/"
python3 -m venv "$INSTALL_DIR/venv" || die "python3-venv is missing (apt install python3-venv)."
"$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install --quiet -r "$INSTALL_DIR/requirements.txt"

yellow "Testing connection to $URL…"
if sudo -u gpu-monitor bash -c "set -a; . '$ENV_FILE'; exec '$INSTALL_DIR/venv/bin/python' '$INSTALL_DIR/collector.py' --once"; then
  green "First report accepted."
else
  yellow "The test report failed; check the URL and key. The service is installed anyway and will keep retrying."
fi

install -m 644 "$REPO_DIR/scripts/gpu-monitor-collector.service" "/etc/systemd/system/$SERVICE.service"
systemctl daemon-reload
systemctl enable --now "$SERVICE"
green "Collector installed and running. Logs: journalctl -u $SERVICE -f"
