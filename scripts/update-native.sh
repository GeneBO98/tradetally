#!/bin/bash

# TradeTally Native Update Script
# Usage: ./update-native.sh

cd "$(dirname "$0")/.."

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
  node -e "
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
  " 2>&1 || echo "[UPDATE] Could not send failure email"
}

echo "[UPDATE] Pulling latest changes..."

# Check for uncommitted changes that would block git pull
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "[UPDATE] WARNING: Uncommitted changes detected. Stashing before pull..."
  STASH_OUTPUT=$(git stash 2>&1)
  echo "$STASH_OUTPUT"
  STASHED=1
else
  STASHED=0
fi

# Check for untracked files that might conflict
UNTRACKED=$(git ls-files --others --exclude-standard)

PULL_OUTPUT=$(git pull origin main 2>&1)
PULL_EXIT=$?
echo "$PULL_OUTPUT"

if [ $PULL_EXIT -ne 0 ]; then
  echo "[UPDATE] ERROR: git pull failed!"
  send_failure_email \
    "[TradeTally] Update failed - git pull error" \
    "The TradeTally update script failed during git pull on $(hostname) at $(date).

Error output:
$PULL_OUTPUT

Untracked files:
$UNTRACKED

Please SSH in and resolve manually."

  # Restore stashed changes if we stashed
  if [ $STASHED -eq 1 ]; then
    echo "[UPDATE] Restoring stashed changes..."
    git stash pop 2>&1 || true
  fi
  exit 1
fi

# Restore stashed changes after successful pull
if [ $STASHED -eq 1 ]; then
  echo "[UPDATE] Restoring stashed changes..."
  STASH_POP_OUTPUT=$(git stash pop 2>&1)
  STASH_POP_EXIT=$?
  echo "$STASH_POP_OUTPUT"
  if [ $STASH_POP_EXIT -ne 0 ]; then
    echo "[UPDATE] WARNING: Stash pop had conflicts. Manual resolution needed."
    send_failure_email \
      "[TradeTally] Update warning - stash conflicts" \
      "The TradeTally update pulled successfully but stash pop had conflicts on $(hostname) at $(date).

Output:
$STASH_POP_OUTPUT

Please SSH in and resolve the conflicts."
  fi
fi

if echo "$PULL_OUTPUT" | grep -q "Already up to date."; then
  echo "[UPDATE] No changes, skipping build/restart."
  exit 0
fi

echo "[UPDATE] Installing backend dependencies..."
if ! (cd backend && npm install 2>&1); then
  echo "[UPDATE] ERROR: Backend npm install failed!"
  send_failure_email \
    "[TradeTally] Update failed - backend npm install" \
    "Backend npm install failed on $(hostname) at $(date). The server was NOT restarted."
  exit 1
fi

echo "[UPDATE] Installing frontend dependencies and building..."
if ! (cd frontend && npm install && npm run build 2>&1); then
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
