#!/usr/bin/env python3
"""
GPU Monitor - lightweight collector agent

Collects GPU metrics (NVIDIA via nvidia-smi, AMD via rocm-smi) and system
metrics (psutil), then sends them to the central API every INTERVAL_SEC.

Environment:
  CENTRAL_API_URL   central server, e.g. https://monitor.example.com (required)
  CENTRAL_API_KEY   per-server key from the UI, or the global collector key (required)
  SERVER_ID         unique id (default: hostname)
  SERVER_NAME       display name (default: SERVER_ID)
  SERVER_TAGS       comma separated tags (only used for auto-registered servers)
  INTERVAL_SEC      seconds between reports (default 30)
  DISK_PATH         filesystem to report (default /)
  BUFFER_SIZE       reports kept in memory while the API is unreachable (default 120)
  LOG_LEVEL         DEBUG, INFO, WARNING... (default INFO)

Usage:
  python3 collector.py            run forever
  python3 collector.py --once     send one report and exit (exit code 1 on failure)
  python3 collector.py --dry-run  print one report as JSON without sending it
"""

import json
import logging
import os
import platform
import signal
import socket
import subprocess
import sys
import time
from collections import deque
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import psutil
import requests

VERSION = "2.0.0"
HEARTBEAT_FILE = os.getenv("HEARTBEAT_FILE", "/tmp/gpu-monitor-collector.heartbeat")

logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("collector")

NA_VALUES = {"", "N/A", "[N/A]", "[Not Supported]", "Not Supported", "[Unknown Error]"}


def to_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    s = str(value).strip().rstrip("%").strip()
    if s in NA_VALUES:
        return default
    try:
        return float(s)
    except ValueError:
        return default


def run(cmd: List[str], timeout: int = 20) -> Optional[str]:
    """Run a command, returning stdout or None if it is missing or fails."""
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return None
    except subprocess.TimeoutExpired:
        logger.error("%s timed out", cmd[0])
        return None
    if result.returncode != 0:
        logger.debug("%s failed: %s", cmd[0], result.stderr.strip())
        return None
    return result.stdout


# --------------------------------------------------------------------- GPUs

NVIDIA_FIELDS = [
    "index", "name", "uuid", "utilization.gpu", "memory.total", "memory.used",
    "temperature.gpu", "power.draw", "fan.speed", "driver_version",
]


def parse_nvidia_smi(output: str) -> List[Dict[str, Any]]:
    gpus = []
    for line in output.strip().splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < len(NVIDIA_FIELDS):
            continue
        # GPU names can contain commas: rebuild from both ends
        extra = len(parts) - len(NVIDIA_FIELDS)
        name = ", ".join(parts[1:2 + extra])
        rest = parts[2 + extra:]
        try:
            gpus.append({
                "gpuIndex": int(parts[0]),
                "vendor": "nvidia",
                "name": name,
                "uuid": rest[0] if rest[0] not in NA_VALUES else None,
                "utilPercent": to_float(rest[1]),
                "vramTotalMB": to_float(rest[2]),
                "vramUsedMB": to_float(rest[3]),
                "tempC": to_float(rest[4]),
                "powerW": to_float(rest[5]),
                "fanPercent": to_float(rest[6]),
                "driverVersion": rest[7] if rest[7] not in NA_VALUES else "unknown",
            })
        except (ValueError, IndexError) as e:
            logger.warning("Could not parse nvidia-smi line %r: %s", line, e)
    return gpus


def get_nvidia_metrics() -> List[Dict[str, Any]]:
    output = run([
        "nvidia-smi",
        f"--query-gpu={','.join(NVIDIA_FIELDS)}",
        "--format=csv,noheader,nounits",
    ])
    return parse_nvidia_smi(output) if output else []


def _pick(card: Dict[str, Any], *needles: str) -> Any:
    """Find a rocm-smi value whose key contains all needles (key names vary by version)."""
    for key, value in card.items():
        k = key.lower()
        if all(n in k for n in needles):
            return value
    return None


def parse_rocm_smi(output: str, driver: str = "unknown") -> List[Dict[str, Any]]:
    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        logger.warning("Could not parse rocm-smi JSON output")
        return []
    if isinstance(data.get("system"), dict):
        driver = data["system"].get("Driver version", driver)
    gpus = []
    for key, card in sorted(data.items()):
        if not key.startswith("card") or not isinstance(card, dict):
            continue
        try:
            index = int(key[4:])
        except ValueError:
            continue
        power = _pick(card, "power", "(w)") or _pick(card, "power")
        vram_total = to_float(_pick(card, "vram", "total", "memory", "(b)"))
        vram_used = to_float(_pick(card, "vram", "used", "(b)"))
        gpus.append({
            "gpuIndex": index,
            "vendor": "amd",
            "name": str(_pick(card, "card", "series") or _pick(card, "card", "model") or "AMD GPU"),
            "uuid": str(_pick(card, "unique id")) if _pick(card, "unique id") else None,
            "utilPercent": to_float(_pick(card, "gpu use")),
            "vramTotalMB": round(vram_total / 1024 / 1024),
            "vramUsedMB": round(vram_used / 1024 / 1024),
            "tempC": to_float(_pick(card, "temperature", "edge") or _pick(card, "temperature", "junction") or _pick(card, "temperature")),
            "powerW": to_float(power),
            "fanPercent": to_float(_pick(card, "fan", "%")),
            "driverVersion": str(driver),
        })
    return gpus


def get_amd_metrics() -> List[Dict[str, Any]]:
    output = run([
        "rocm-smi", "--showuse", "--showtemp", "--showpower", "--showfan",
        "--showmeminfo", "vram", "--showproductname", "--showdriverversion",
        "--showuniqueid", "--json",
    ])
    return parse_rocm_smi(output) if output else []


# ------------------------------------------------------------------- system

def read_os_name() -> str:
    try:
        with open("/etc/os-release") as f:
            for line in f:
                if line.startswith("PRETTY_NAME="):
                    return line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    return f"{platform.system()} {platform.release()}"


def read_cpu_model() -> str:
    try:
        with open("/proc/cpuinfo") as f:
            for line in f:
                if line.lower().startswith("model name"):
                    return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.processor() or platform.machine()


class MetricsCollector:
    def __init__(self) -> None:
        self.api_url = os.getenv("CENTRAL_API_URL", "http://localhost:5100").rstrip("/")
        self.api_key = os.getenv("CENTRAL_API_KEY", "")
        self.server_id = os.getenv("SERVER_ID") or socket.gethostname()
        self.server_name = os.getenv("SERVER_NAME") or self.server_id
        self.tags = [t.strip() for t in os.getenv("SERVER_TAGS", "").split(",") if t.strip()]
        self.interval = max(5, int(os.getenv("INTERVAL_SEC", "30")))
        self.disk_path = os.getenv("DISK_PATH", "/")
        self.buffer: deque = deque(maxlen=int(os.getenv("BUFFER_SIZE", "120")))
        self.session = requests.Session()
        self.session.headers.update({
            "Content-Type": "application/json",
            "x-api-key": self.api_key,
            "User-Agent": f"gpu-monitor-collector/{VERSION}",
        })
        self.host = {
            "hostname": socket.gethostname(),
            "os": read_os_name(),
            "cpuModel": read_cpu_model(),
            "cpuCores": psutil.cpu_count() or 0,
            "collectorVersion": VERSION,
        }
        self._last_net = None
        self._running = True
        psutil.cpu_percent(interval=None)  # prime: next call returns usage since now

        if not self.api_key:
            logger.warning("CENTRAL_API_KEY is empty: the API will reject reports")
        logger.info("Collector %s for server %s (%s) -> %s every %ss",
                    VERSION, self.server_id, self.server_name, self.api_url, self.interval)

    def stop(self, *_: Any) -> None:
        logger.info("Stopping collector")
        self._running = False

    def get_network_rates(self) -> Dict[str, float]:
        counters = psutil.net_io_counters()
        now = time.monotonic()
        rates = {}
        if self._last_net:
            last_counters, last_time = self._last_net
            elapsed = max(now - last_time, 0.001)
            rates = {
                "netRxBps": max(0, (counters.bytes_recv - last_counters.bytes_recv) / elapsed),
                "netTxBps": max(0, (counters.bytes_sent - last_counters.bytes_sent) / elapsed),
            }
        self._last_net = (counters, now)
        return rates

    def get_system_metrics(self) -> Dict[str, Any]:
        memory = psutil.virtual_memory()
        try:
            disk = psutil.disk_usage(self.disk_path)
            disk_metrics = {
                "diskPercent": round(disk.percent, 2),
                "diskUsedGB": round(disk.used / 1024 ** 3, 2),
                "diskTotalGB": round(disk.total / 1024 ** 3, 2),
            }
        except OSError as e:
            logger.warning("Cannot read disk usage of %s: %s", self.disk_path, e)
            disk_metrics = {"diskPercent": 0}
        try:
            load1, load5, load15 = os.getloadavg()
        except (OSError, AttributeError):
            load1 = load5 = load15 = 0.0

        return {
            "cpuPercent": round(psutil.cpu_percent(interval=None), 2),
            "ramPercent": round(memory.percent, 2),
            "ramUsedMB": round((memory.total - memory.available) / 1024 ** 2),
            "ramTotalMB": round(memory.total / 1024 ** 2),
            **disk_metrics,
            "load1": round(load1, 2),
            "load5": round(load5, 2),
            "load15": round(load15, 2),
            "uptimeSec": int(time.time() - psutil.boot_time()),
            **{k: round(v) for k, v in self.get_network_rates().items()},
        }

    def collect(self) -> Dict[str, Any]:
        return {
            "server": {"id": self.server_id, "name": self.server_name, "tags": self.tags},
            "host": self.host,
            "sys": self.get_system_metrics(),
            "gpus": get_nvidia_metrics() + get_amd_metrics(),
            "ts": datetime.now(timezone.utc).isoformat(),
        }

    def send(self, payload: Dict[str, Any]) -> Optional[bool]:
        """True = accepted, False = retry later, None = rejected for good (drop it)."""
        try:
            response = self.session.post(f"{self.api_url}/v1/ingest", data=json.dumps(payload), timeout=15)
        except requests.RequestException as e:
            logger.warning("Cannot reach %s: %s", self.api_url, e.__class__.__name__)
            return False
        if response.ok:
            return True
        if response.status_code in (401, 403):
            logger.error("API rejected the key (%s): %s", response.status_code, response.text[:200])
            return False
        if response.status_code == 400:
            logger.error("API rejected the payload: %s", response.text[:500])
            return None
        logger.warning("API returned %s: %s", response.status_code, response.text[:200])
        return False

    def flush(self) -> bool:
        """Send the newest report first, then the backlog. Returns True if all went through."""
        while self.buffer:
            result = self.send(self.buffer[-1])
            if result is False:
                return False
            self.buffer.pop()
        return True

    def heartbeat(self) -> None:
        try:
            with open(HEARTBEAT_FILE, "w") as f:
                f.write(str(time.time()))
        except OSError:
            pass

    def run(self) -> None:
        signal.signal(signal.SIGTERM, self.stop)
        signal.signal(signal.SIGINT, self.stop)
        failures = 0
        next_run = time.monotonic()

        while self._running:
            try:
                self.buffer.append(self.collect())
                if self.flush():
                    if failures:
                        logger.info("Connection restored after %d failed attempts", failures)
                    failures = 0
                    self.heartbeat()
                    logger.debug("Report sent")
                else:
                    failures += 1
                    logger.warning("Report kept in buffer (%d pending)", len(self.buffer))
            except Exception:  # never let one bad sample kill the agent
                logger.exception("Unexpected error during collection")

            next_run += self.interval
            # Back off a little when the API is down, without drifting forever
            delay = max(0.0, next_run - time.monotonic()) + min(failures, 10) * 3
            end = time.monotonic() + delay
            while self._running and time.monotonic() < end:
                time.sleep(min(1.0, end - time.monotonic()))
            if time.monotonic() > next_run + self.interval:
                next_run = time.monotonic()


def main() -> None:
    collector = MetricsCollector()
    if "--dry-run" in sys.argv:
        time.sleep(1)  # let CPU and network counters accumulate
        print(json.dumps(collector.collect(), indent=2))
        return
    if "--once" in sys.argv:
        time.sleep(1)
        ok = collector.send(collector.collect())
        print("OK" if ok else "FAILED")
        sys.exit(0 if ok else 1)
    collector.run()


if __name__ == "__main__":
    main()
