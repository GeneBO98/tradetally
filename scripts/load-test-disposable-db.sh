#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
BASE_DB="${DB_NAME:-trade_journal}"
LOAD_DB="${LOAD_TEST_DB_NAME:-${BASE_DB}_load_${GITHUB_RUN_ID:-local}_$$}"
LOAD_PORT="${LOAD_TEST_BACKEND_PORT:-3101}"
LOAD_PID=""

export PGHOST="${PGHOST:-${DB_HOST:-}}"
export PGPORT="${PGPORT:-${DB_PORT:-}}"
export PGUSER="${PGUSER:-${DB_USER:-}}"
export PGPASSWORD="${PGPASSWORD:-${DB_PASSWORD:-}}"

cleanup() {
  if [[ -n "$LOAD_PID" ]] && kill -0 "$LOAD_PID" >/dev/null 2>&1; then
    kill "$LOAD_PID" >/dev/null 2>&1 || true
    wait "$LOAD_PID" >/dev/null 2>&1 || true
  fi
  dropdb --if-exists "$LOAD_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if [[ "${LOAD_TEST_TERMINATE_TEMPLATE_CONNECTIONS:-false}" == "true" ]]; then
  psql -d postgres -v ON_ERROR_STOP=1 -c \
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${BASE_DB}' AND pid <> pg_backend_pid();" >/dev/null
fi

if ! createdb -T "$BASE_DB" "$LOAD_DB"; then
  if [[ "${LOAD_TEST_ALLOW_FRESH_MIGRATE:-false}" != "true" ]]; then
    echo "Could not clone template database ${BASE_DB}; stop active template connections or set LOAD_TEST_TERMINATE_TEMPLATE_CONNECTIONS=true. Set LOAD_TEST_ALLOW_FRESH_MIGRATE=true only for schemas that can migrate from scratch." >&2
    exit 1
  fi
  createdb "$LOAD_DB"
  (
    cd "$BACKEND_DIR"
    DB_NAME="$LOAD_DB" npm run migrate
  )
fi

(
  cd "$BACKEND_DIR"
  DB_NAME="$LOAD_DB" PORT="$LOAD_PORT" RUN_MIGRATIONS=false ENABLE_TEST_SUPPORT=true npm start
) &
LOAD_PID="$!"

for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:$LOAD_PORT/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl -fsS "http://127.0.0.1:$LOAD_PORT/api/health" >/dev/null

(
  cd "$BACKEND_DIR"
  API_BASE_URL="http://127.0.0.1:$LOAD_PORT" npm run load:execution
)
