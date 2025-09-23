#!/bin/bash

# Docker entrypoint script for TradeTally backend
# This script ensures proper database initialization and migration

set -e

echo "[START] Starting TradeTally backend container..."

# Wait for database to be ready
echo "[WAIT] Waiting for database connection..."
until nc -z "${DB_HOST:-localhost}" "${DB_PORT:-5432}"; do
  echo "   Database not ready, waiting..."
  sleep 2
done

echo "[OK] Database connection established"

# Run database migrations
echo "[MIGRATE] Running database migrations..."
if [ "${RUN_MIGRATIONS:-true}" != "false" ]; then
  node src/utils/migrate.js
else
  echo "   Skipping migrations (RUN_MIGRATIONS=false)"
fi

# Set default environment variables
export NODE_ENV="${NODE_ENV:-production}"

echo "[CONFIG] Configuration:"
echo "   Environment: ${NODE_ENV}"
echo "   Database: ${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-tradetally}"

# Start the application
echo "[START] Starting TradeTally application..."
exec "$@"