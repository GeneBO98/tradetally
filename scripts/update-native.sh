#!/bin/bash

# TradeTally Native Update Script
# Usage: ./update-native.sh

cd "$(dirname "$0")/.."

PNPM_CMD=(corepack pnpm)
STASHED=0

# Load env vars for email notifications
if [ -f .env ]; then
  export $(grep -E '^(EMAIL_HOST|EMAIL_PORT|EMAIL_USER|EMAIL_PASS|EMAIL_FROM|ADMIN_EMAIL)=' .env | xargs)
fi

send_failure_email() {
  local subject="$1"
  local body="$2"

  if [ -z "$ADMIN_EMAIL" ] || [ -z "$EMAIL_HOST" ] || [ -z "$EMAIL_USER" ]; then
    echo "[UPDATE] WARNING: Cannot send failure email - ADMIN_EMAIL or EMAIL config not set"
    return
  fi

  # Use curl to send via SMTP (requires curl with smtp support)
  # Fall back to node if available
  (cd backend && node -e "
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: (parseInt(process.env.EMAIL_PORT) || 587) === 465,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
    });
    transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@tradetally.io',
      to: process.env.ADMIN_EMAIL,
      subject: $(printf '%s' "$subject" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('/dev/stdin','utf8')))"),
      text: $(printf '%s' "$body" | node -e "process.stdout.write(JSON.stringify(require('fs').readFileSync('/dev/stdin','utf8')))")
    }).then(() => console.log('[UPDATE] Failure notification sent to ' + process.env.ADMIN_EMAIL))
      .catch(e => console.error('[UPDATE] Failed to send notification:', e.message));
  ") 2>&1 || echo "[UPDATE] Could not send failure email"
}

restore_stash() {
  if [ "${STASHED:-0}" -eq 1 ]; then
    echo "[UPDATE] Restoring stashed changes..."
    git stash pop 2>&1 || true
    STASHED=0
  fi
}

trap restore_stash EXIT

echo "[UPDATE] Pulling latest changes..."

CURRENT_BRANCH=$(git symbolic-ref --quiet --short HEAD 2>/dev/null)
if [ -z "$CURRENT_BRANCH" ]; then
  echo "[UPDATE] ERROR: Could not determine current branch."
  send_failure_email \
    "[TradeTally] Update failed - unknown current branch" \
    "The TradeTally update script could not determine the current branch on $(hostname) at $(date).

Deployment was aborted because the script could not identify which branch should be updated."
  exit 1
fi

UPSTREAM_REF=$(git rev-parse --abbrev-ref --symbolic-full-name "@{u}" 2>/dev/null)
if [ -z "$UPSTREAM_REF" ]; then
  echo "[UPDATE] ERROR: Could not determine upstream branch for $CURRENT_BRANCH."
  send_failure_email \
    "[TradeTally] Update failed - missing upstream branch" \
    "The TradeTally update script could not determine the upstream branch for '$CURRENT_BRANCH' on $(hostname) at $(date).

Deployment was aborted because the script could not identify which remote branch should be updated."
  exit 1
fi

UPSTREAM_REMOTE=${UPSTREAM_REF%%/*}
UPSTREAM_BRANCH=${UPSTREAM_REF#*/}
UPDATED=0

# Check for uncommitted changes that would block git pull
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[UPDATE] WARNING: Uncommitted changes detected. Stashing before pull..."
  STASH_OUTPUT=$(git stash push -u -m "native-update-$(date +%Y%m%d-%H%M%S)" 2>&1)
  echo "$STASH_OUTPUT"
  STASHED=1
else
  STASHED=0
fi

# Check for untracked files that might conflict
UNTRACKED=$(git ls-files --others --exclude-standard)

PULL_OUTPUT=$(git pull "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH" 2>&1)
PULL_EXIT=$?
echo "$PULL_OUTPUT"

if [ $PULL_EXIT -ne 0 ]; then
  echo "[UPDATE] ERROR: git pull failed!"
  send_failure_email \
    "[TradeTally] Update failed - git pull error" \
    "The TradeTally update script failed during git pull of $UPSTREAM_REF on $(hostname) at $(date).

Error output:
$PULL_OUTPUT

Untracked files:
$UNTRACKED

Please SSH in and resolve manually."

  restore_stash
  exit 1
fi

if ! echo "$PULL_OUTPUT" | grep -q "Already up to date."; then
  UPDATED=1
fi

PUBLIC_FETCH_OUTPUT=$(git fetch origin main 2>&1)
PUBLIC_FETCH_EXIT=$?
echo "$PUBLIC_FETCH_OUTPUT"

if [ $PUBLIC_FETCH_EXIT -ne 0 ]; then
  echo "[UPDATE] ERROR: Could not fetch origin/main to compare public branch status."
  send_failure_email \
    "[TradeTally] Update failed - could not verify public branch" \
    "The TradeTally update script could not fetch origin/main while preparing to deploy $UPSTREAM_REF on $(hostname) at $(date).

Deployment was aborted because the script could not verify that the current branch includes the latest public changes."

  restore_stash
  exit 1
fi

if [ "$UPSTREAM_REF" != "origin/main" ]; then
  MISSING_PUBLIC_COMMITS=$(git cherry HEAD origin/main 2>/dev/null | grep -c '^+' || true)
  if [ "$MISSING_PUBLIC_COMMITS" -gt 0 ]; then
    MISSING_PUBLIC_LIST=$(git cherry -v HEAD origin/main 2>/dev/null | grep '^+' || true)
    echo "[UPDATE] origin/main has $MISSING_PUBLIC_COMMITS public commit(s) not present on $UPSTREAM_REF. Merging public changes into the private branch..."
    echo "$MISSING_PUBLIC_LIST"

    MERGE_OUTPUT=$(git merge --no-edit origin/main 2>&1)
    MERGE_EXIT=$?
    echo "$MERGE_OUTPUT"

    if [ $MERGE_EXIT -ne 0 ]; then
      echo "[UPDATE] ERROR: Automatic merge of origin/main into $UPSTREAM_REF failed!"
      git merge --abort 2>&1 || true
      send_failure_email \
        "[TradeTally] Update failed - automatic public sync conflict" \
        "The TradeTally update script attempted to merge origin/main into $UPSTREAM_REF on $(hostname) at $(date), but the automatic sync failed.

Missing public commits:
$MISSING_PUBLIC_LIST

Merge output:
$MERGE_OUTPUT

Please SSH in and resolve the branch sync manually."

      restore_stash
      exit 1
    fi

    PUSH_OUTPUT=$(git push "$UPSTREAM_REMOTE" "HEAD:$UPSTREAM_BRANCH" 2>&1)
    PUSH_EXIT=$?
    echo "$PUSH_OUTPUT"

    if [ $PUSH_EXIT -ne 0 ]; then
      echo "[UPDATE] ERROR: Failed to push merged branch back to $UPSTREAM_REF!"
      send_failure_email \
        "[TradeTally] Update failed - could not push synced private branch" \
        "The TradeTally update script successfully merged origin/main into $CURRENT_BRANCH on $(hostname) at $(date), but failed to push the synced branch back to $UPSTREAM_REF.

Push output:
$PUSH_OUTPUT

Please SSH in and resolve the remote branch state manually."

      restore_stash
      exit 1
    fi

    UPDATED=1
    echo "[UPDATE] Private branch synced with origin/main and pushed to $UPSTREAM_REF."
  else
    echo "[UPDATE] Public branch changes already present in $UPSTREAM_REF."
  fi
else
  echo "[UPDATE] Current branch already tracks origin/main; skipping private branch sync."
fi

if [ $UPDATED -eq 0 ]; then
  echo "[UPDATE] No changes, skipping build/restart."
  exit 0
fi

echo "[UPDATE] Installing workspace dependencies..."
if ! "${PNPM_CMD[@]}" install --frozen-lockfile 2>&1; then
  echo "[UPDATE] ERROR: Workspace pnpm install failed!"
  send_failure_email \
    "[TradeTally] Update failed - workspace pnpm install" \
    "Workspace pnpm install failed on $(hostname) at $(date). The server was NOT restarted."
  exit 1
fi

echo "[UPDATE] Building frontend..."
if ! "${PNPM_CMD[@]}" --dir frontend run build 2>&1; then
  echo "[UPDATE] ERROR: Frontend build failed!"
  send_failure_email \
    "[TradeTally] Update failed - frontend build" \
    "Frontend build failed on $(hostname) at $(date). The server was NOT restarted."
  exit 1
fi

echo "[UPDATE] Restarting backend..."
if ! pm2 restart all 2>&1; then
  echo "[UPDATE] ERROR: pm2 restart failed!"
  send_failure_email \
    "[TradeTally] Update failed - pm2 restart" \
    "pm2 restart failed on $(hostname) at $(date). The server may be down!"
  exit 1
fi

echo "[UPDATE] Reloading nginx..."
sudo nginx -s reload 2>&1 || true

echo "[UPDATE] Done!"
