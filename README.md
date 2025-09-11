# GPU & Server Monitor

A comprehensive monitoring solution for GPU servers with real-time metrics, alerting, and lightweight collector agents.

## Features

- **Real-time GPU Monitoring**: Track NVIDIA and AMD GPU utilization, temperature, memory usage, and power consumption
- **System Metrics**: Monitor CPU, RAM, disk usage, load average, and uptime
- **Live Dashboard**: Modern web interface with real-time updates via WebSocket
- **Intelligent Alerting**: Configurable thresholds with email and webhook notifications
- **Lightweight Collectors**: Python agents that gather metrics with minimal overhead
- **Multi-deployment**: Docker Compose and systemd service options
- **Secure**: API key authentication for collectors, JWT for web interface
- **Scalable**: PostgreSQL database with efficient metric storage

## Architecture

