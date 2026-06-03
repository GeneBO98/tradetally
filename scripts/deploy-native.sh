#!/bin/bash

# TradeTally Native Deployment Script
# Usage: ./deploy-native.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# Prevent overlapping deploys. Without this, a second deploy can rewrite source
# files *after* the first deploy has already restarted pm2, leaving the live
# process running stale code (this exact race froze Finnhub usage metrics:
# the process booted at 15:58:54 while finnhub.js was rewritten at 16:00:12,
# and nothing restarted it again).
LOCK_FILE="/tmp/tradetally-deploy.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[DEPLOY] Another deployment is already running (lock: $LOCK_FILE). Aborting." >&2
  exit 1
fi

echo "[DEPLOY] Starting native deployment..."

# Pull latest changes from the CLOUD repo — the single source of truth.
# Fast-forward ONLY: a non-fast-forward means cloud/main has diverged from the
# local checkout and needs a deliberate, reviewed merge. We never auto-merge
# here — auto-merging the PUBLIC repo (origin) is exactly how a "remove
# marketing page from self-host" commit once wiped the cloud landing page.
# Public (origin) changes must be merged into cloud/main via a reviewed PR.
echo "[DEPLOY] Fetching and fast-forwarding to cloud/main..."
git fetch cloud
git merge --ff-only cloud/main

# Install backend dependencies if package.json changed
echo "[DEPLOY] Checking backend dependencies..."
pnpm install --filter tradetally-backend --prod --frozen-lockfile

# Build frontend
echo "[DEPLOY] Building frontend..."
pnpm install --filter tradetally-frontend --frozen-lockfile
pnpm --dir frontend run build

# Run database migrations
echo "[DEPLOY] Running database migrations..."
pnpm --dir backend run migrate

# Record the newest deployed file timestamp AFTER all code is in place but
# BEFORE the restart, so we can verify the live process actually picked it up.
set +e
NEWEST_CODE_EPOCH=$(find backend/src frontend/dist -type f -printf '%T@\n' 2>/dev/null | sort -n | tail -1 | cut -d. -f1)
set -e
[ -n "$NEWEST_CODE_EPOCH" ] || NEWEST_CODE_EPOCH=0

# Restart backend (must be the LAST step that touches running code)
echo "[DEPLOY] Restarting backend..."
pm2 restart all --update-env
pm2 save >/dev/null 2>&1 || true

# Reload nginx
echo "[DEPLOY] Reloading nginx..."
sudo nginx -s reload

# Verify the live process is actually running the freshly deployed code.
# Catches the "stale process" bug: the process start time must be newer than
# the newest deployed source file, otherwise the restart didn't take effect.
echo "[DEPLOY] Verifying tradetally is running the deployed code..."
sleep 3
APP_PID="$(pm2 pid tradetally 2>/dev/null || true)"
if [ -z "${APP_PID}" ] || [ "${APP_PID}" = "0" ]; then
  echo "[DEPLOY] ERROR: tradetally is not online after restart." >&2
  pm2 status tradetally >&2 || true
  exit 1
fi
PROC_START_EPOCH=$(date -d "$(ps -o lstart= -p "$APP_PID")" +%s 2>/dev/null || echo 0)
if [ "$PROC_START_EPOCH" -lt "$NEWEST_CODE_EPOCH" ]; then
  echo "[DEPLOY] ERROR: tradetally (started $(date -d @"$PROC_START_EPOCH" 2>/dev/null)) is running" >&2
  echo "         STALE code older than the deploy ($(date -d @"$NEWEST_CODE_EPOCH" 2>/dev/null)). Re-run the deploy." >&2
  exit 1
fi

echo "[DEPLOY] Verified: tradetally (PID $APP_PID) is running the freshly deployed code."

# Post-deploy smoke test — fail the deploy loudly if the public page or API is
# broken, instead of "succeeding" on a regressed state.
echo "[DEPLOY] Running post-deploy smoke test..."
if ! bash "$SCRIPT_DIR/post-deploy-smoke.sh" "$(git rev-parse --short HEAD)"; then
  echo "[DEPLOY] ERROR: post-deploy smoke test failed — investigate immediately." >&2
  echo "         (App is running but the public page/API checks did not pass.)" >&2
  exit 1
fi

echo "[DEPLOY] Deployment complete!"
