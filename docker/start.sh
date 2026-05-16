#!/bin/sh
set -eu

# Wait for database to be ready
echo "[WAIT] Waiting for database connection..."
until nc -z "${DB_HOST:-postgres}" "${DB_PORT:-5432}"; do
  echo "   Database not ready, waiting..."
  sleep 2
done
echo "[OK] Database connection established"

# Set environment variables for mobile support
export RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"

# Ensure upload directories exist and are writable by appuser
# (bind-mounted volumes may have root-only permissions)
mkdir -p /app/backend/uploads/trades /app/backend/uploads/diary /app/backend/uploads/avatars /app/backend/backups /app/backend/src/logs
chown -R appuser:appgroup /app/backend/uploads /app/backend/backups /app/backend/src/logs

# Start backend as non-root user (migrations will run automatically)
echo "[START] Starting TradeTally backend..."
cd /app/backend && su-exec appuser node src/server.js &
BACKEND_PID=$!

# Wait for backend to start
for i in $(seq 1 30); do
  if nc -z 127.0.0.1 "${PORT:-3000}"; then
    echo "[OK] Backend is listening"
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[ERROR] Backend exited during startup"
    wait "$BACKEND_PID"
    exit 1
  fi
  sleep 1
done

# Start nginx
echo "[START] Starting nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!

while true; do
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    echo "[ERROR] Backend exited; stopping nginx"
    kill "$NGINX_PID" 2>/dev/null || true
    wait "$BACKEND_PID"
    exit 1
  fi

  if ! kill -0 "$NGINX_PID" 2>/dev/null; then
    echo "[ERROR] Nginx exited; stopping backend"
    kill "$BACKEND_PID" 2>/dev/null || true
    wait "$NGINX_PID"
    exit 1
  fi

  sleep 2
done
