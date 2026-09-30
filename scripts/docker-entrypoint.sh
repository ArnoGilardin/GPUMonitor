#!/bin/sh
# Apply the database schema (idempotent, additive changes) before starting.
# Set DB_AUTO_MIGRATE=false to manage the schema yourself.
set -e
if [ "${DB_AUTO_MIGRATE:-true}" = "true" ]; then
  echo "Syncing database schema…"
  npx drizzle-kit push --force
fi
exec "$@"
