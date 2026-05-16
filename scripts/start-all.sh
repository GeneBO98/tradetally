#!/usr/bin/env bash
# Start backend, frontend, and bridge for local end-to-end testing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

command -v node >/dev/null || { echo "node is required"; exit 1; }
command -v npm >/dev/null || { echo "npm is required"; exit 1; }
command -v uv >/dev/null || { echo "uv is required for the bridge"; exit 1; }

TRADETALLY_PORT="${TRADETALLY_PORT:-3001}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BRIDGE_PORT="${BRIDGE_PORT:-3002}"
START_FRONTEND="${START_FRONTEND:-true}"
START_BRIDGE="${START_BRIDGE:-true}"

pids=()

cleanup() {
  for pid in "${pids[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
}
trap cleanup EXIT INT TERM

echo "Starting TradeTally API on port ${TRADETALLY_PORT}..."
(
  cd "$PROJECT_DIR/backend"
  exec env PORT="$TRADETALLY_PORT" node src/server.js
) &
pids+=("$!")
BACKEND_PID="$!"

if [[ "$START_FRONTEND" == "true" ]]; then
  echo "Starting frontend on port ${FRONTEND_PORT}..."
(
  cd "$PROJECT_DIR/frontend"
  exec env VITE_API_URL="http://localhost:${TRADETALLY_PORT}/api" npm run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT"
) &
  pids+=("$!")
  FRONTEND_PID="$!"
else
  FRONTEND_PID="disabled"
fi

if [[ "$START_BRIDGE" == "true" ]]; then
  echo "Starting Journal Bridge on port ${BRIDGE_PORT}..."
(
  cd "$PROJECT_DIR/bridge"
  exec env BRIDGE_PORT="$BRIDGE_PORT" uv run uvicorn journal_bridge.main:app --host 127.0.0.1 --port "$BRIDGE_PORT"
) &
  pids+=("$!")
  BRIDGE_PID="$!"
else
  BRIDGE_PID="disabled"
fi

echo ""
echo "TradeTally API: http://localhost:${TRADETALLY_PORT} (PID: ${BACKEND_PID})"
echo "Frontend:      http://localhost:${FRONTEND_PORT} (PID: ${FRONTEND_PID})"
echo "Bridge:        http://localhost:${BRIDGE_PORT} (PID: ${BRIDGE_PID})"
echo ""
echo "Press Ctrl+C to stop all services"

exit_code=0
while true; do
  for pid in "${pids[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      wait "$pid" || exit_code=$?
      echo "A service exited; stopping the rest."
      exit "$exit_code"
    fi
  done
  sleep 1
done
