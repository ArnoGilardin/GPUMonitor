FROM python:3.12-slim

# nvidia-smi is injected at runtime by the NVIDIA Container Toolkit (--gpus all);
# for AMD GPUs, mount rocm-smi or use the native (systemd) install instead.
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY collector.py .

RUN useradd -m -u 1000 collector && chown -R collector:collector /app
USER collector

ENV PYTHONUNBUFFERED=1 \
    HEARTBEAT_FILE=/tmp/gpu-monitor-collector.heartbeat

# Healthy when a report was accepted during the last 5 minutes
HEALTHCHECK --interval=60s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import os,sys,time; f=os.environ['HEARTBEAT_FILE']; sys.exit(0 if os.path.exists(f) and time.time()-os.path.getmtime(f) < 300 else 1)"

CMD ["python", "collector.py"]
