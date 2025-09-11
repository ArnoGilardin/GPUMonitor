# GPU & Server Monitor

## Overview

A comprehensive monitoring solution for GPU servers that provides real-time metrics collection, web-based dashboard visualization, and intelligent alerting. The system consists of a central monitoring server with a React-based web interface and lightweight Python collectors that run on monitored servers to gather GPU and system metrics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Technology Stack**: React with TypeScript, Vite for build tooling, Tailwind CSS for styling
- **Component Library**: Radix UI components with shadcn/ui design system
- **State Management**: TanStack Query for server state, React Context for authentication
- **Real-time Updates**: WebSocket integration for live metric updates
- **Routing**: Wouter for client-side routing
- **UI Structure**: Responsive dashboard with sidebar navigation, header with search/alerts, and dedicated pages for dashboard, server details, alerts, and settings

### Backend Architecture
- **Runtime**: Node.js with Express framework using TypeScript
- **Database ORM**: Drizzle ORM with PostgreSQL as the primary database
- **Authentication**: JWT-based authentication for web users, API key authentication for collector agents
- **Real-time Communication**: WebSocket server for pushing live updates to connected clients
- **Rate Limiting**: Express rate limiting middleware to prevent abuse
- **CORS**: Configured for cross-origin requests with environment-based origin settings

### Database Design
- **Schema Management**: Drizzle ORM with migrations in the `/migrations` directory
- **Core Tables**:
  - `servers`: Server registration and metadata
  - `gpuSnapshots`: GPU metrics over time (utilization, temperature, VRAM, power)
  - `sysSnapshots`: System metrics over time (CPU, RAM, disk usage)
  - `alerts`: Alert instances and resolution tracking
  - `rules`: Configurable alert rules with thresholds
  - `users`: User authentication and role management
  - `settings`: Application configuration

### Collector Architecture
- **Language**: Python with minimal dependencies (requests, psutil)
- **Deployment**: Dockerized collector with systemd service option
- **Data Collection**:
  - NVIDIA GPUs via `nvidia-smi` command-line tool
  - AMD GPUs via `rocm-smi` (when available)
  - System metrics via `psutil` library
- **Communication**: HTTP POST requests to central API with API key authentication
- **Configuration**: Environment variables for API endpoint, keys, and collection intervals

### Authentication & Security
- **Web Authentication**: JWT tokens with 7-day expiration, stored in localStorage
- **Collector Authentication**: API key-based authentication via `x-api-key` header
- **Password Security**: bcrypt hashing for user passwords
- **RBAC**: Simple role-based access control (admin/viewer roles)
- **Development Seeding**: Controlled demo user creation with environment flags

### Alert System
- **Rule Engine**: Configurable thresholds for GPU temperature, utilization, VRAM usage, CPU, and disk metrics
- **Alert Levels**: Warning and critical severity levels
- **Notification Channels**: Email integration via SendGrid, webhook support for external services
- **Alert Lifecycle**: Creation, active monitoring, and resolution tracking

### Real-time Features
- **WebSocket Server**: Dedicated WebSocket endpoint for live metric streaming
- **Client Updates**: Automatic UI updates for new metrics, alerts, and server status changes
- **Connection Management**: Automatic reconnection handling with exponential backoff

## External Dependencies

### Database Services
- **PostgreSQL**: Primary database for production deployments via DATABASE_URL
- **Neon Database**: Serverless PostgreSQL provider integration via @neondatabase/serverless

### Email Services
- **SendGrid**: Email delivery service for alert notifications via @sendgrid/mail

### UI Component Libraries
- **Radix UI**: Headless UI components for accessibility and customization
- **Recharts**: Chart library for metric visualization
- **Lucide React**: Icon library for consistent iconography

### Development Tools
- **TypeScript**: Type safety across frontend and backend
- **Vite**: Fast build tool with HMR for development
- **ESBuild**: Production bundling for the backend
- **Drizzle Kit**: Database migration and schema management

### Monitoring Dependencies
- **System Metrics**: psutil Python library for cross-platform system monitoring
- **GPU Metrics**: nvidia-smi and rocm-smi command-line tools for hardware monitoring
- **WebSocket**: ws library for real-time communication
- **Rate Limiting**: express-rate-limit for API protection

### Authentication & Security
- **JWT**: jsonwebtoken for token-based authentication
- **Password Hashing**: bcrypt for secure password storage
- **CORS**: cors middleware for cross-origin request handling