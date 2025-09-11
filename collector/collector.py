#!/usr/bin/env python3
"""
GPU & Server Monitor - Lightweight Collector Agent

This collector gathers GPU metrics (NVIDIA/AMD) and system metrics,
then sends them to the central monitoring API.
"""

import os
import sys
import time
import json
import logging
import subprocess
import platform
import requests
import psutil
from datetime import datetime
from typing import Dict, List, Optional, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class MetricsCollector:
    def __init__(self):
        self.server_id = os.getenv('SERVER_ID', platform.node())
        self.server_name = os.getenv('SERVER_NAME', self.server_id)
        self.api_url = os.getenv('CENTRAL_API_URL', 'http://localhost:5000')
        self.api_key = os.getenv('CENTRAL_API_KEY', 'collector-key-123')
        self.interval = int(os.getenv('INTERVAL_SEC', '30'))
        self.tags = os.getenv('SERVER_TAGS', '').split(',') if os.getenv('SERVER_TAGS') else []
        
        # Remove empty tags
        self.tags = [tag.strip() for tag in self.tags if tag.strip()]
        
        logger.info(f"Collector initialized for server: {self.server_id}")
        logger.info(f"API URL: {self.api_url}")
        logger.info(f"Collection interval: {self.interval}s")
        logger.info(f"Tags: {self.tags}")

    def get_nvidia_metrics(self) -> List[Dict[str, Any]]:
        """Collect NVIDIA GPU metrics using nvidia-smi."""
        try:
            # Check if nvidia-smi is available
            result = subprocess.run(['nvidia-smi', '--version'], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode != 0:
                logger.debug("nvidia-smi not available")
                return []

            # Get GPU count first
            result = subprocess.run([
                'nvidia-smi', '--list-gpus'
            ], capture_output=True, text=True, timeout=10)
            
            if result.returncode != 0:
                logger.warning("Failed to list NVIDIA GPUs")
                return []

            gpu_count = len([line for line in result.stdout.strip().split('\n') if line.strip()])
            
            if gpu_count == 0:
                return []

            # Query GPU metrics
            cmd = [
                'nvidia-smi',
                '--query-gpu=index,utilization.gpu,utilization.memory,memory.total,memory.used,temperature.gpu,power.draw,fan.speed,driver_version',
                '--format=csv,noheader,nounits'
            ]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode != 0:
                logger.error(f"nvidia-smi query failed: {result.stderr}")
                return []

            gpus = []
            for line in result.stdout.strip().split('\n'):
                if not line.strip():
                    continue
                    
                parts = [part.strip() for part in line.split(',')]
                if len(parts) >= 9:
                    try:
                        gpu_data = {
                            'gpuIndex': int(parts[0]),
                            'vendor': 'nvidia',
                            'utilPercent': float(parts[1]) if parts[1] != '[Not Supported]' else 0,
                            'vramUsedMB': int(parts[4]) if parts[4] != '[Not Supported]' else 0,
                            'vramTotalMB': int(parts[3]) if parts[3] != '[Not Supported]' else 0,
                            'tempC': float(parts[5]) if parts[5] != '[Not Supported]' else 0,
                            'powerW': float(parts[6]) if parts[6] != '[Not Supported]' else 0,
                            'fanPercent': float(parts[7]) if parts[7] != '[Not Supported]' else 0,
                            'driverVersion': parts[8] if parts[8] != '[Not Supported]' else 'Unknown'
                        }
                        gpus.append(gpu_data)
                    except (ValueError, IndexError) as e:
                        logger.warning(f"Failed to parse GPU data: {line} - {e}")
                        continue

            logger.debug(f"Collected {len(gpus)} NVIDIA GPU metrics")
            return gpus

        except subprocess.TimeoutExpired:
            logger.error("nvidia-smi command timed out")
            return []
        except FileNotFoundError:
            logger.debug("nvidia-smi not found")
            return []
        except Exception as e:
            logger.error(f"Error collecting NVIDIA metrics: {e}")
            return []

    def get_amd_metrics(self) -> List[Dict[str, Any]]:
        """Collect AMD GPU metrics using rocm-smi."""
        try:
            # Check if rocm-smi is available
            result = subprocess.run(['rocm-smi', '--version'], 
                                  capture_output=True, text=True, timeout=10)
            if result.returncode != 0:
                logger.debug("rocm-smi not available")
                return []

            # Query AMD GPUs
            cmd = ['rocm-smi', '--showuse', '--showtemp', '--showfan', '--showpower', '--csv']
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            
            if result.returncode != 0:
                logger.warning(f"rocm-smi query failed: {result.stderr}")
                return []

            gpus = []
            lines = result.stdout.strip().split('\n')
            
            # Skip header line
            for i, line in enumerate(lines[1:] if len(lines) > 1 else []):
                if not line.strip():
                    continue
                    
                parts = [part.strip() for part in line.split(',')]
                if len(parts) >= 4:
                    try:
                        gpu_data = {
                            'gpuIndex': i,
                            'vendor': 'amd',
                            'utilPercent': float(parts[1]) if parts[1] and parts[1] != 'N/A' else 0,
                            'vramUsedMB': 0,  # Not easily available from rocm-smi
                            'vramTotalMB': 0,  # Not easily available from rocm-smi
                            'tempC': float(parts[2]) if parts[2] and parts[2] != 'N/A' else 0,
                            'powerW': float(parts[3]) if parts[3] and parts[3] != 'N/A' else 0,
                            'fanPercent': 0,  # Would need additional parsing
                            'driverVersion': 'Unknown'
                        }
                        gpus.append(gpu_data)
                    except (ValueError, IndexError) as e:
                        logger.warning(f"Failed to parse AMD GPU data: {line} - {e}")
                        continue

            logger.debug(f"Collected {len(gpus)} AMD GPU metrics")
            return gpus

        except subprocess.TimeoutExpired:
            logger.error("rocm-smi command timed out")
            return []
        except FileNotFoundError:
            logger.debug("rocm-smi not found")
            return []
        except Exception as e:
            logger.error(f"Error collecting AMD metrics: {e}")
            return []

    def get_system_metrics(self) -> Dict[str, Any]:
        """Collect system metrics using psutil."""
        try:
            # CPU usage
            cpu_percent = psutil.cpu_percent(interval=1)
            
            # Memory usage
            memory = psutil.virtual_memory()
            ram_percent = memory.percent
            
            # Disk usage (root partition)
            disk = psutil.disk_usage('/')
            disk_percent = disk.percent
            
            # Load average (Unix-like systems)
            try:
                load_avg = os.getloadavg()[0]  # 1-minute load average
            except (OSError, AttributeError):
                load_avg = 0.0  # Windows doesn't have load average
            
            # Uptime
            boot_time = psutil.boot_time()
            uptime_sec = int(time.time() - boot_time)
            
            return {
                'cpuPercent': round(cpu_percent, 2),
                'ramPercent': round(ram_percent, 2),
                'diskPercent': round(disk_percent, 2),
                'load1': round(load_avg, 2),
                'uptimeSec': uptime_sec
            }
            
        except Exception as e:
            logger.error(f"Error collecting system metrics: {e}")
            return {
                'cpuPercent': 0,
                'ramPercent': 0,
                'diskPercent': 0,
                'load1': 0,
                'uptimeSec': 0
            }

    def collect_metrics(self) -> Dict[str, Any]:
        """Collect all metrics and format for API submission."""
        # Collect GPU metrics from both vendors
        nvidia_gpus = self.get_nvidia_metrics()
        amd_gpus = self.get_amd_metrics()
        all_gpus = nvidia_gpus + amd_gpus
        
        # Collect system metrics
        sys_metrics = self.get_system_metrics()
        
        # Format payload
        payload = {
            'server': {
                'id': self.server_id,
                'name': self.server_name,
                'tags': self.tags
            },
            'sys': sys_metrics,
            'gpus': all_gpus,
            'ts': datetime.utcnow().isoformat() + 'Z'
        }
        
        logger.debug(f"Collected metrics: {len(all_gpus)} GPUs, system metrics")
        return payload

    def send_metrics(self, payload: Dict[str, Any]) -> bool:
        """Send metrics to the central API."""
        try:
            headers = {
                'Content-Type': 'application/json',
                'x-api-key': self.api_key
            }
            
            url = f"{self.api_url.rstrip('/')}/v1/ingest"
            
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                timeout=30
            )
            
            if response.status_code == 200:
                logger.debug("Metrics sent successfully")
                return True
            else:
                logger.error(f"API returned status {response.status_code}: {response.text}")
                return False
                
        except requests.exceptions.Timeout:
            logger.error("Request timed out")
            return False
        except requests.exceptions.ConnectionError:
            logger.error("Connection error - is the API server running?")
            return False
        except Exception as e:
            logger.error(f"Error sending metrics: {e}")
            return False

    def run(self):
        """Main collection loop."""
        logger.info("Starting metrics collection...")
        
        consecutive_failures = 0
        max_failures = 10
        
        while True:
            try:
                # Collect metrics
                payload = self.collect_metrics()
                
                # Send to API
                success = self.send_metrics(payload)
                
                if success:
                    consecutive_failures = 0
                    logger.info(f"Metrics collected and sent for server {self.server_id}")
                else:
                    consecutive_failures += 1
                    logger.warning(f"Failed to send metrics ({consecutive_failures}/{max_failures})")
                    
                    if consecutive_failures >= max_failures:
                        logger.error(f"Too many consecutive failures ({max_failures}), exiting")
                        sys.exit(1)
                
                # Wait for next collection
                time.sleep(self.interval)
                
            except KeyboardInterrupt:
                logger.info("Received interrupt signal, shutting down...")
                break
            except Exception as e:
                logger.error(f"Unexpected error in main loop: {e}")
                consecutive_failures += 1
                if consecutive_failures >= max_failures:
                    logger.error("Too many consecutive errors, exiting")
                    sys.exit(1)
                time.sleep(self.interval)

def main():
    """Entry point."""
    collector = MetricsCollector()
    collector.run()

if __name__ == '__main__':
    main()
