# ---- build: client bundle + server bundle
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime
FROM node:22-alpine AS production
WORKDIR /app
RUN apk add --no-cache dumb-init

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# versioned SQL migrations, applied by the app at startup (DB_AUTO_MIGRATE=false to disable)
COPY migrations ./migrations

RUN addgroup -g 1001 -S nodejs && adduser -S appuser -u 1001 -G nodejs \
    && chown -R appuser:nodejs /app
USER appuser

ENV NODE_ENV=production PORT=5100
EXPOSE 5100

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||5100)+'/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]
