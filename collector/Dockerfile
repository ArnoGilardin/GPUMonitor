FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for GPU monitoring
RUN apt-get update && apt-get install -y \
    procps \
    lsb-release \
    curl \
    gnupg2 \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Install NVIDIA drivers and tools (will be no-op if no GPU)
RUN curl -fsSL https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64/3bf863cc.pub | apt-key add - && \
    echo "deb https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2204/x86_64 /" > /etc/apt/sources.list.d/cuda.list && \
    apt-get update && \
    apt-get install -y --no-install-recommends nvidia-utils-535 || true && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy collector script
COPY collector.py .

# Create non-root user
RUN useradd -m -u 1000 collector && \
    chown -R collector:collector /app

USER collector

# Health check
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health', timeout=5)" || exit 1

CMD ["python", "collector.py"]
