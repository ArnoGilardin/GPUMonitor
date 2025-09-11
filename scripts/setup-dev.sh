#!/bin/bash

# GPU Monitor - Development Environment Setup Script

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}GPU Monitor - Development Setup${NC}"
echo "=================================="

# Check if Node.js is installed
check_nodejs() {
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Node.js is not installed. Please install Node.js 18+ first.${NC}"
        echo "Visit: https://nodejs.org/"
        exit 1
    fi

    NODE_VERSION=$(node --version | cut -d'v' -f2)
    MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)
    
    if [ "$MAJOR_VERSION" -lt 18 ]; then
        echo -e "${YELLOW}Warning: Node.js version $NODE_VERSION detected. Recommended: 18+${NC}"
    else
        echo -e "${GREEN}✓ Node.js $NODE_VERSION detected${NC}"
    fi
}

# Check if PostgreSQL is available
check_postgresql() {
    if command -v psql &> /dev/null; then
        echo -e "${GREEN}✓ PostgreSQL client found${NC}"
        return 0
    elif command -v docker &> /dev/null; then
        echo -e "${YELLOW}PostgreSQL client not found, but Docker is available${NC}"
        echo "You can use Docker Compose to run PostgreSQL locally"
        return 0
    else
        echo -e "${YELLOW}PostgreSQL not found. You'll need either:${NC}"
        echo "  1. Local PostgreSQL installation"
        echo "  2. Docker for containerized PostgreSQL"
        echo "  3. Remote PostgreSQL database"
    fi
}

# Setup environment file
setup_env_file() {
    if [ ! -f .env ]; then
        echo -e "${YELLOW}Creating .env file from template...${NC}"
        cp .env.example .env
        
        # Generate random secrets
        JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "change-this-jwt-secret-$(date +%s)")
        COLLECTOR_API_KEY=$(openssl rand -base64 16 2>/dev/null || echo "collector-key-$(date +%s)")
        
        # Update .env with generated secrets
        if command -v sed &> /dev/null; then
            sed -i.bak "s/your-super-secret-jwt-key-change-this-in-production/$JWT_SECRET/" .env
            sed -i.bak "s/your-collector-api-key-change-this/$COLLECTOR_API_KEY/" .env
            rm .env.bak 2>/dev/null || true
        fi
        
        echo -e "${GREEN}✓ .env file created${NC}"
        echo -e "${YELLOW}Please edit .env file with your specific configuration${NC}"
    else
        echo -e "${GREEN}✓ .env file already exists${NC}"
    fi
}

# Install dependencies
install_dependencies() {
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}"
}

# Setup database
setup_database() {
    echo -e "${YELLOW}Setting up database...${NC}"
    
    # Check if DATABASE_URL is configured
    if grep -q "DATABASE_URL=postgresql://" .env; then
        echo "Attempting to connect to database and run migrations..."
        if npm run db:push > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Database migrations applied${NC}"
        else
            echo -e "${YELLOW}Could not connect to database. Please ensure:${NC}"
            echo "  1. PostgreSQL is running"
            echo "  2. DATABASE_URL in .env is correct"
            echo "  3. Database exists and is accessible"
        fi
    else
        echo -e "${YELLOW}DATABASE_URL not configured in .env${NC}"
        echo "Please configure your database connection"
    fi
}

# Create collector environment
setup_collector() {
    echo -e "${YELLOW}Setting up collector environment...${NC}"
    
    if [ ! -f collector/.env ]; then
        cp collector/.env.example collector/.env
        echo -e "${GREEN}✓ Collector .env created${NC}"
        echo -e "${YELLOW}Please configure collector/.env for your setup${NC}"
    else
        echo -e "${GREEN}✓ Collector .env already exists${NC}"
    fi
}

# Check Docker for optional services
check_docker() {
    if command -v docker &> /dev/null; then
        echo -e "${GREEN}✓ Docker found${NC}"
        if command -v docker-compose &> /dev/null; then
            echo -e "${GREEN}✓ Docker Compose found${NC}"
        else
            echo -e "${YELLOW}Docker Compose not found${NC}"
            echo "You can install it from: https://docs.docker.com/compose/install/"
        fi
    else
        echo -e "${YELLOW}Docker not found${NC}"
        echo "Docker is optional but recommended for running PostgreSQL and collector"
    fi
}

# Create basic directory structure
create_directories() {
    echo -e "${YELLOW}Creating directories...${NC}"
    
    mkdir -p data
    mkdir -p logs
    
    echo -e "${GREEN}✓ Directories created${NC}"
}

# Display next steps
show_next_steps() {
    echo ""
    echo -e "${BLUE}Setup Complete!${NC}"
    echo "==============="
    echo ""
    echo "Next steps:"
    echo ""
    echo "1. Configure your environment:"
    echo "   - Edit .env file with your database and API keys"
    echo "   - Configure collector/.env for your collector setup"
    echo ""
    echo "2. Start development server:"
    echo "   ${GREEN}make dev${NC}     # or npm run dev"
    echo ""
    echo "3. Run database migrations (if not done automatically):"
    echo "   ${GREEN}make migrate${NC} # or npm run db:push"
    echo ""
    echo "4. Access the application:"
    echo "   http://localhost:5000"
    echo ""
    echo "5. Optional - Start PostgreSQL with Docker:"
    echo "   ${GREEN}docker-compose up postgres -d${NC}"
    echo ""
    echo "6. Build and run collector:"
    echo "   ${GREEN}cd collector && docker-compose up -d${NC}"
    echo ""
    echo "Available commands:"
    echo "   ${GREEN}make help${NC}    # Show all available commands"
    echo "   ${GREEN}make dev${NC}     # Start development server"
    echo "   ${GREEN}make build${NC}   # Build for production"
    echo "   ${GREEN}make compose-up${NC} # Start all services with Docker"
    echo ""
    echo "For production deployment, see README.md"
}

# Main setup flow
main() {
    echo "Starting development environment setup..."
    echo ""
    
    check_nodejs
    check_postgresql
    check_docker
    echo ""
    
    setup_env_file
    install_dependencies
    create_directories
    setup_database
    setup_collector
    
    show_next_steps
}

# Run main function
main "$@"
