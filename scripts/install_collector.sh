#!/bin/bash

# GPU Monitor Collector Installation Script
# This script installs the collector on Ubuntu systems

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}GPU Monitor Collector Installation Script${NC}"
echo "=========================================="

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}This script should not be run as root${NC}"
   exit 1
fi

# Check Ubuntu version
if ! grep -q "Ubuntu" /etc/os-release; then
    echo -e "${YELLOW}Warning: This script is designed for Ubuntu. Proceeding anyway...${NC}"
fi

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Install Docker if not present
install_docker() {
    if command_exists docker; then
        echo -e "${GREEN}Docker is already installed${NC}"
        return 0
    fi

    echo -e "${YELLOW}Installing Docker...${NC}"
    
    # Update package index
    sudo apt-get update
    
    # Install required packages
    sudo apt-get install -y \
        ca-certificates \
        curl \
        gnupg \
        lsb-release

    # Add Docker's official GPG key
    sudo mkdir -p /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

    # Set up Docker repository
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
        $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Update package index again
    sudo apt-get update

    # Install Docker Engine
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    # Add user to docker group
    sudo usermod -aG docker $USER

    echo -e "${GREEN}Docker installed successfully${NC}"
    echo -e "${YELLOW}Please log out and log back in for Docker group changes to take effect${NC}"
}

# Install Docker Compose if not present
install_docker_compose() {
    if command_exists docker-compose; then
        echo -e "${GREEN}Docker Compose is already installed${NC}"
        return 0
    fi

    echo -e "${YELLOW}Installing Docker Compose...${NC}"
    
    # Download Docker Compose
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    
    # Make it executable
    sudo chmod +x /usr/local/bin/docker-compose
    
    echo -e "${GREEN}Docker Compose installed successfully${NC}"
}

# Setup NVIDIA Container Toolkit for GPU support
setup_nvidia_docker() {
    if ! command_exists nvidia-smi; then
        echo -e "${YELLOW}NVIDIA drivers not detected. Skipping NVIDIA Container Toolkit setup.${NC}"
        return 0
    fi

    echo -e "${YELLOW}Setting up NVIDIA Container Toolkit...${NC}"
    
    # Add NVIDIA package repository
    distribution=$(. /etc/os-release;echo $ID$VERSION_ID) \
    && curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg \
    && curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | \
            sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
            sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

    # Update package index
    sudo apt-get update

    # Install NVIDIA Container Toolkit
    sudo apt-get install -y nvidia-container-toolkit

    # Configure Docker to use NVIDIA runtime
    sudo nvidia-ctk runtime configure --runtime=docker
    sudo systemctl restart docker

    echo -e "${GREEN}NVIDIA Container Toolkit setup complete${NC}"
}

# Create collector directory and files
setup_collector() {
    COLLECTOR_DIR="$HOME/gpu-monitor-collector"
    
    echo -e "${YELLOW}Setting up collector in $COLLECTOR_DIR...${NC}"
    
    # Create directory
    mkdir -p "$COLLECTOR_DIR"
    cd "$COLLECTOR_DIR"

    # Create Dockerfile
    cat > Dockerfile << 'EOF'
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy collector script
COPY collector.py .

# Run as non-root user
RUN useradd -m -u 1000 collector
USER collector

CMD ["python", "collector.py"]
EOF

    # Create requirements.txt
    cat > requirements.txt << 'EOF'
requests>=2.28.0
psutil>=5.9.0
EOF

    # Download collector script
    if command_exists curl; then
        echo "Downloading collector script..."
        # In a real scenario, this would download from your repository
        echo "Please copy the collector.py file to this directory: $COLLECTOR_DIR"
    else
        echo "Please copy the collector.py file to this directory: $COLLECTOR_DIR"
    fi

    # Create docker-compose.yml
    cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  gpu-collector:
    build: .
    container_name: gpu-monitor-collector
    restart: unless-stopped
    environment:
      - CENTRAL_API_URL=${CENTRAL_API_URL:-http://host.docker.internal:5000}
      - CENTRAL_API_KEY=${CENTRAL_API_KEY:-collector-key-123}
      - SERVER_ID=${SERVER_ID}
      - SERVER_NAME=${SERVER_NAME}
      - SERVER_TAGS=${SERVER_TAGS}
      - INTERVAL_SEC=${INTERVAL_SEC:-30}
    volumes:
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: all
              capabilities: [gpu]
    network_mode: host
EOF

    # Create .env file with prompts
    create_env_file

    echo -e "${GREEN}Collector setup complete in $COLLECTOR_DIR${NC}"
}

# Create environment file with user input
create_env_file() {
    echo -e "${YELLOW}Configuring collector settings...${NC}"
    
    # Prompt for configuration
    read -p "Central API URL (e.g., https://your-monitor.domain.com): " API_URL
    read -p "API Key: " API_KEY
    read -p "Server ID (default: $(hostname)): " SERVER_ID
    SERVER_ID=${SERVER_ID:-$(hostname)}
    read -p "Server Name (default: $SERVER_ID): " SERVER_NAME
    SERVER_NAME=${SERVER_NAME:-$SERVER_ID}
    read -p "Server Tags (comma-separated, e.g., gpu,production): " SERVER_TAGS
    read -p "Collection Interval in seconds (default: 30): " INTERVAL
    INTERVAL=${INTERVAL:-30}

    # Create .env file
    cat > .env << EOF
# Central API Configuration
CENTRAL_API_URL=$API_URL
CENTRAL_API_KEY=$API_KEY

# Server Identification
SERVER_ID=$SERVER_ID
SERVER_NAME=$SERVER_NAME
SERVER_TAGS=$SERVER_TAGS

# Collection Settings
INTERVAL_SEC=$INTERVAL
EOF

    echo -e "${GREEN}Configuration saved to .env${NC}"
}

# Start the collector
start_collector() {
    echo -e "${YELLOW}Starting GPU Monitor Collector...${NC}"
    
    # Build and start the container
    docker-compose up -d --build
    
    echo -e "${GREEN}Collector started successfully!${NC}"
    echo "To view logs: docker-compose logs -f"
    echo "To stop: docker-compose down"
    echo "To restart: docker-compose restart"
}

# Main installation flow
main() {
    echo "Starting installation..."
    
    # Install dependencies
    install_docker
    install_docker_compose
    setup_nvidia_docker
    
    # Setup collector
    setup_collector
    
    echo -e "${GREEN}Installation complete!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Copy the collector.py file to $(pwd)"
    echo "2. Review the .env file and adjust settings if needed"
    echo "3. Start the collector with: docker-compose up -d"
    echo ""
    
    read -p "Would you like to start the collector now? (y/N): " START_NOW
    if [[ $START_NOW =~ ^[Yy]$ ]]; then
        start_collector
    fi
}

# Run main function
main "$@"
