# Build stage for frontend
FROM node:18-alpine as frontend-build

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build frontend and backend
RUN npm run build

# Production stage
FROM node:18-alpine as production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S appuser -u 1001

# Copy built application
COPY --from=frontend-build --chown=appuser:nodejs /app/dist ./dist
COPY --from=frontend-build --chown=appuser:nodejs /app/node_modules ./node_modules
COPY --from=frontend-build --chown=appuser:nodejs /app/package*.json ./

# Create data directory for SQLite fallback
RUN mkdir -p /app/data && chown appuser:nodejs /app/data

USER appuser

EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
