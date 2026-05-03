#!/bin/sh

# Wait for database to be ready
echo "[WAIT] Waiting for database connection..."
until nc -z "${DB_HOST:-postgres}" "${DB_PORT:-5432}"; do
  echo "   Database not ready, waiting..."
  sleep 2
done
echo "[OK] Database connection established"

# Set environment variables for mobile support
export RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"

# Ensure writable runtime directories exist for mounted volumes.
mkdir -p \
  /app/backend/uploads/trades \
  /app/backend/uploads/diary \
  /app/backend/uploads/avatars \
  /app/backend/src/data/backups \
  /app/backend/src/logs
chown -R appuser:appgroup /app/backend/uploads /app/backend/src/data /app/backend/src/logs

# Start backend as non-root user (migrations will run automatically)
echo "[START] Starting TradeTally backend..."
cd /app/backend && su-exec appuser node src/server.js &

# Wait for backend to start
sleep 5

# Start nginx
nginx -g "daemon off;"
