.PHONY: help dev build clean test lint format install docker-build docker-run docker-push compose-up compose-down migrate simulate test-e2e

# Default target
help: ## Show this help message
	@echo "Available targets:"
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development
dev: ## Start development server
	npm run dev

install: ## Install dependencies
	npm install

lint: ## Run linting
	npm run check

format: ## Format code
	npx prettier --write .

clean: ## Clean build artifacts
	rm -rf dist/
	rm -rf node_modules/
	rm -rf client/dist/

##@ Database
migrate: ## Apply database migrations
	npm run db:migrate

migration: ## Generate a migration after editing shared/schema.ts
	npm run db:generate

simulate: ## Send metrics from simulated GPU servers (SERVERS=6)
	npm run simulate -- --servers $(or $(SERVERS),6)

##@ Building
build: ## Build the application
	npm run build

test: ## Run unit tests (TypeScript + collector)
	npm test
	cd collector && python3 -m unittest test_collector

test-e2e: ## Run Playwright end-to-end tests (needs a dev database)
	npx playwright test

##@ Docker
docker-build: ## Build Docker image
	docker build -t gpu-monitor:latest .

docker-run: ## Run Docker container
	docker run -p 5100:5100 --env-file .env gpu-monitor:latest

docker-push: ## Push Docker image (set REGISTRY variable)
	@if [ -z "$(REGISTRY)" ]; then echo "Please set REGISTRY variable: make docker-push REGISTRY=your-registry.com"; exit 1; fi
	docker tag gpu-monitor:latest $(REGISTRY)/gpu-monitor:latest
	docker push $(REGISTRY)/gpu-monitor:latest

##@ Docker Compose
compose-up: ## Start services with Docker Compose
	docker compose up -d

compose-demo: ## Start services plus 6 simulated GPU servers
	docker compose --profile demo up -d

compose-down: ## Stop services
	docker compose down

compose-logs: ## Show logs
	docker compose logs -f

compose-build: ## Build and start services
	docker compose up -d --build

##@ Collector
collector-build: ## Build collector Docker image
	cd collector && docker build -t gpu-monitor-collector:latest .

collector-run: ## Run collector container
	cd collector && docker compose up -d

collector-logs: ## Show collector logs
	cd collector && docker compose logs -f

##@ Production
deploy: build docker-build ## Build and prepare for deployment
	@echo "Application built and ready for deployment"

backup-db: ## Backup database
	@if [ -z "$(DATABASE_URL)" ]; then echo "DATABASE_URL not set"; exit 1; fi
	pg_dump $(DATABASE_URL) > backup_$(shell date +%Y%m%d_%H%M%S).sql

restore-db: ## Restore database (set BACKUP_FILE variable)
	@if [ -z "$(BACKUP_FILE)" ]; then echo "Please set BACKUP_FILE variable"; exit 1; fi
	@if [ -z "$(DATABASE_URL)" ]; then echo "DATABASE_URL not set"; exit 1; fi
	psql $(DATABASE_URL) < $(BACKUP_FILE)

##@ Utilities
check-env: ## Check required environment variables
	@echo "Checking environment variables..."
	@node -e "const required=['DATABASE_URL','JWT_SECRET','COLLECTOR_API_KEY']; required.forEach(key => { if (!process.env[key]) { console.error('Missing:', key); process.exit(1); } else { console.log('✓', key); } });"

setup-dev: ## Set up development environment
	@echo "Setting up development environment..."
	@cp .env.example .env
	@echo "Please edit .env file with your configuration"
	@make install
	@echo "Development environment ready!"

logs: ## Show application logs
	@if [ -f "app.log" ]; then tail -f app.log; else echo "No log file found"; fi

status: ## Show system status
	@echo "=== System Status ==="
	@echo "Node version: $$(node --version)"
	@echo "NPM version: $$(npm --version)"
	@echo "Docker version: $$(docker --version 2>/dev/null || echo 'Docker not installed')"
	@echo "Database: $$(curl -sf http://localhost:$${PORT:-5100}/health >/dev/null && echo 'OK (app healthy)' || echo 'app not running')"
