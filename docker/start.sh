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

# Start backend (migrations will run automatically)
echo "[START] Starting TradeTally backend..."

if [ "$NODE_ENV" = "development" ]; then
    cd /app/backend && npm run dev &
    cd /app/frontend && npm run dev &
else
    cd /app/backend || exit 1
    node src/server.js &
fi

# Wait for backend to start
sleep 5

# Start nginx
nginx -g "daemon off;"
