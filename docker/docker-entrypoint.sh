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

# Run the canonical pnlEngine backfill once per database.
# - Idempotent: skipped if pnl_engine_backfill_status.applied_at is set.
# - Reversible: pnl_engine_backfill_backup retains the pre-engine snapshot.
#   Roll back with: node scripts/backfill-pnl-engine.js --rollback
# - Opt out with SKIP_PNL_BACKFILL=true.
echo "[MIGRATE] Checking canonical P&L engine backfill..."
if [ "${SKIP_PNL_BACKFILL:-false}" != "true" ]; then
  node scripts/backfill-pnl-engine.js --apply
  if [ $? -ne 0 ]; then
    echo "[WARNING] P&L backfill reported an error. Container will still start; review logs and re-run manually if needed."
  fi
else
  echo "   Skipping P&L backfill (SKIP_PNL_BACKFILL=true)"
fi

# Set default environment variables
export NODE_ENV="${NODE_ENV:-production}"

echo "[CONFIG] Configuration:"
echo "   Environment: ${NODE_ENV}"
echo "   Database: ${DB_HOST:-localhost}:${DB_PORT:-5432}/${DB_NAME:-tradetally}"

# Start the application
echo "[START] Starting TradeTally application..."
exec "$@"