#!/bin/bash

# TradeTally Native Update Script
# Usage: ./update-native.sh

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

PNPM_CMD=(corepack pnpm)
PM2_APP_NAME="tradetally"
PM2_ECOSYSTEM="$REPO_ROOT/scripts/ecosystem.config.js"
CURRENT_STEP="initializing"
STASHED=0
STASH_REF=""
UPDATED=0

log() {
  echo "[UPDATE] $*"
}

fail() {
  local subject="$1"
  local body="$2"
  log "ERROR: $subject"
  send_failure_email "[TradeTally] Update failed - $subject" "$body"
  exit 1
}

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

run_step() {
  local description="$1"
  shift
  CURRENT_STEP="$description"
  log "$description..."
  "$@"
}

load_env_value() {
  local key="$1"
  local value="$2"

  if [ -z "$key" ]; then
    return
  fi

  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  export "$key=$value"
}

load_notification_env() {
  if [ ! -f .env ]; then
    return
  fi

  while IFS='=' read -r key value; do
    case "$key" in
      EMAIL_HOST|EMAIL_PORT|EMAIL_USER|EMAIL_PASS|EMAIL_FROM|ADMIN_EMAIL)
        load_env_value "$key" "$value"
        ;;
    esac
  done < <(grep -E '^(EMAIL_HOST|EMAIL_PORT|EMAIL_USER|EMAIL_PASS|EMAIL_FROM|ADMIN_EMAIL)=' .env || true)
}

send_failure_email() {
  local subject="$1"
  local body="$2"

  if [ -z "${ADMIN_EMAIL:-}" ] || [ -z "${EMAIL_HOST:-}" ] || [ -z "${EMAIL_USER:-}" ] || [ -z "${EMAIL_PASS:-}" ]; then
    log "WARNING: Cannot send failure email - email settings are incomplete"
    return
  fi

  if ! command_exists node; then
    log "WARNING: Cannot send failure email - node is not available"
    return
  fi

  (
    cd backend || exit 1
    UPDATE_MAIL_SUBJECT="$subject" UPDATE_MAIL_BODY="$body" node <<'EOF'
const nodemailer = require('nodemailer');

async function main() {
  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: parseInt(process.env.EMAIL_PORT || '587', 10) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@tradetally.io',
    to: process.env.ADMIN_EMAIL,
    subject: process.env.UPDATE_MAIL_SUBJECT,
    text: process.env.UPDATE_MAIL_BODY
  });

  console.log('[UPDATE] Failure notification sent to ' + process.env.ADMIN_EMAIL);
}

main().catch((error) => {
  console.error('[UPDATE] Failed to send notification:', error.message);
  process.exit(1);
});
EOF
  ) 2>&1 || log "WARNING: Could not send failure email"
}

restore_stash() {
  if [ "${STASHED:-0}" -ne 1 ] || [ -z "${STASH_REF:-}" ]; then
    return
  fi

  log "Restoring stashed changes from $STASH_REF..."
  if git stash pop --index "$STASH_REF" 2>&1; then
    STASHED=0
    STASH_REF=""
  else
    log "WARNING: Failed to apply stashed changes automatically. The stash was left in git stash list."
  fi
}

handle_unexpected_error() {
  local line="$1"
  local exit_code="${2:-1}"
  local body="The TradeTally native update script failed unexpectedly on $(hostname) at $(date -u).

Step: $CURRENT_STEP
Line: $line
Exit code: $exit_code

Check the deployment logs on the host and resolve the issue manually if the automated recovery path did not complete."

  log "ERROR: Unexpected failure during '$CURRENT_STEP' at line $line (exit $exit_code)."
  send_failure_email "[TradeTally] Update failed - unexpected script error" "$body"
  exit "$exit_code"
}

trap restore_stash EXIT
trap 'handle_unexpected_error "${LINENO}" "$?"' ERR

require_prerequisites() {
  local missing=()
  local command_name

  for command_name in git corepack node pm2; do
    if ! command_exists "$command_name"; then
      missing+=("$command_name")
    fi
  done

  if ! command_exists sudo; then
    log "WARNING: sudo is not available; nginx reload checks will be skipped"
  fi

  if [ "${#missing[@]}" -gt 0 ]; then
    fail \
      "missing prerequisites" \
      "The TradeTally native update script cannot run on $(hostname) at $(date -u) because required commands are missing:

${missing[*]}

Install the missing dependencies and rerun the update."
  fi
}

ensure_pnpm() {
  if "${PNPM_CMD[@]}" --version >/dev/null 2>&1; then
    return
  fi

  log "corepack pnpm is unavailable; attempting to enable corepack"
  corepack enable
  "${PNPM_CMD[@]}" --version >/dev/null 2>&1 || fail \
    "pnpm unavailable" \
    "The TradeTally native update script could not activate pnpm via corepack on $(hostname) at $(date -u)."
}

require_clean_git_state() {
  if [ -f .git/MERGE_HEAD ] || [ -d .git/rebase-merge ] || [ -d .git/rebase-apply ] || [ -d .git/sequencer ]; then
    fail \
      "repository mid-operation" \
      "The repository on $(hostname) at $(date -u) is in the middle of a git operation (merge, rebase, or cherry-pick).

Resolve or abort the in-progress operation before rerunning the native update script."
  fi
}

has_meaningful_local_changes() {
  local path

  if ! git diff --quiet -- . ':(exclude)scripts/update-native.sh' ':(exclude).gitignore'; then
    return 0
  fi

  if ! git diff --cached --quiet -- . ':(exclude)scripts/update-native.sh' ':(exclude).gitignore'; then
    return 0
  fi

  while IFS= read -r path; do
    case "$path" in
      .cloud-push-worktree|.cloud-push-worktree/*|scripts/update-native.sh|.gitignore)
        ;;
      *)
        return 0
        ;;
    esac
  done < <(git ls-files --others --exclude-standard)

  return 1
}

stash_local_changes_if_needed() {
  if ! has_meaningful_local_changes; then
    STASHED=0
    STASH_REF=""
    return
  fi

  local stash_name="native-update-$(date +%Y%m%d-%H%M%S)"

  log "Local changes detected. Stashing before repository sync"
  git stash push -u -m "$stash_name" -- . ':(exclude)scripts/update-native.sh' ':(exclude).gitignore' ':(exclude).cloud-push-worktree' >/dev/null 2>&1 || fail \
    "could not stash local changes" \
    "The TradeTally native update script found local changes on $(hostname) at $(date -u), but could not stash them before syncing the repository."

  STASH_REF="$(git stash list | awk -F: -v target="$stash_name" '$0 ~ target { print $1; exit }')"

  if [ -n "$STASH_REF" ]; then
    STASHED=1
    log "Stashed local changes as $stash_name"
  else
    STASHED=0
    log "git stash reported no changes to save"
  fi
}

sync_current_branch() {
  CURRENT_BRANCH="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  if [ -z "$CURRENT_BRANCH" ]; then
    fail \
      "unknown current branch" \
      "The TradeTally native update script could not determine the current branch on $(hostname) at $(date -u)."
  fi

  UPSTREAM_REF="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
  if [ -z "$UPSTREAM_REF" ]; then
    fail \
      "missing upstream branch" \
      "The TradeTally native update script could not determine the upstream branch for '$CURRENT_BRANCH' on $(hostname) at $(date -u)."
  fi

  UPSTREAM_REMOTE="${UPSTREAM_REF%%/*}"
  UPSTREAM_BRANCH="${UPSTREAM_REF#*/}"

  run_step "Fetching $UPSTREAM_REF" git fetch "$UPSTREAM_REMOTE" "$UPSTREAM_BRANCH"

  local before_head remote_head
  before_head="$(git rev-parse HEAD)"
  remote_head="$(git rev-parse "$UPSTREAM_REF")"

  if [ "$before_head" = "$remote_head" ]; then
    log "$UPSTREAM_REF is already current"
    return
  fi

  if git merge-base --is-ancestor HEAD "$UPSTREAM_REF"; then
    run_step "Fast-forwarding to $UPSTREAM_REF" git merge --ff-only "$UPSTREAM_REF"
    UPDATED=1
    return
  fi

  log "Local branch has diverged from $UPSTREAM_REF. Attempting a rebase-based recovery"
  if git rebase "$UPSTREAM_REF"; then
    UPDATED=1
    return
  fi

  git rebase --abort >/dev/null 2>&1 || true
  fail \
    "branch sync conflict" \
    "The TradeTally native update script could not automatically sync '$CURRENT_BRANCH' with '$UPSTREAM_REF' on $(hostname) at $(date -u).

The branch has diverged and the automatic rebase failed. Resolve the git conflict manually on the host."
}

sync_public_branch_if_needed() {
  run_step "Fetching origin/main" git fetch origin main

  if [ "$UPSTREAM_REF" = "origin/main" ]; then
    log "Current branch already tracks origin/main; skipping public branch sync"
    return
  fi

  local missing_public_commits missing_public_list
  missing_public_commits="$(git cherry HEAD origin/main 2>/dev/null | grep -c '^+' || true)"
  if [ "${missing_public_commits:-0}" -eq 0 ]; then
    log "Public branch changes are already present in $UPSTREAM_REF"
    return
  fi

  missing_public_list="$(git cherry -v HEAD origin/main 2>/dev/null | grep '^+' || true)"
  log "origin/main has $missing_public_commits commit(s) not present on $UPSTREAM_REF. Merging public changes"
  printf '%s\n' "$missing_public_list"

  if ! git merge -X ours --no-edit origin/main; then
    git merge --abort >/dev/null 2>&1 || true
    fail \
      "automatic public sync conflict" \
      "The TradeTally native update script attempted to merge origin/main into $UPSTREAM_REF on $(hostname) at $(date -u), but the automatic sync failed even while preferring the current branch on file conflicts.

Missing public commits:
$missing_public_list"
  fi

  UPDATED=1
  run_step "Pushing synced branch to $UPSTREAM_REF" git push "$UPSTREAM_REMOTE" "HEAD:$UPSTREAM_BRANCH"
  log "Private branch synced with origin/main and pushed to $UPSTREAM_REF"
}

install_dependencies() {
  if "${PNPM_CMD[@]}" install --frozen-lockfile; then
    return
  fi

  log "Initial pnpm install failed. Retrying after refreshing corepack"
  corepack enable
  "${PNPM_CMD[@]}" install --frozen-lockfile || fail \
    "workspace pnpm install" \
    "Workspace pnpm install failed on $(hostname) at $(date -u). The server was not restarted."
}

build_frontend() {
  "${PNPM_CMD[@]}" --dir frontend run build || fail \
    "frontend build" \
    "Frontend build failed on $(hostname) at $(date -u). The server was not restarted."
}

run_backend_migrations() {
  "${PNPM_CMD[@]}" --dir backend run migrate || fail \
    "backend migration" \
    "Backend migrations failed on $(hostname) at $(date -u). The server was not restarted."
}

ensure_backend_logs_dir() {
  mkdir -p "$REPO_ROOT/backend/logs"
}

restart_backend() {
  ensure_backend_logs_dir

  if pm2 describe "$PM2_APP_NAME" >/dev/null 2>&1; then
    log "Restarting PM2 app $PM2_APP_NAME"
    if ! pm2 restart "$PM2_APP_NAME" --update-env; then
      log "PM2 restart failed. Deleting and recreating $PM2_APP_NAME"
      pm2 delete "$PM2_APP_NAME" >/dev/null 2>&1 || true
      pm2 start "$PM2_ECOSYSTEM" --only "$PM2_APP_NAME"
    fi
  else
    log "PM2 app $PM2_APP_NAME is not running. Starting it from ecosystem config"
    pm2 start "$PM2_ECOSYSTEM" --only "$PM2_APP_NAME"
  fi

  pm2 save >/dev/null 2>&1 || true

  local status
  status="$(pm2 jlist 2>/dev/null | node -e "
    const fs = require('fs');
    const app = JSON.parse(fs.readFileSync(0, 'utf8') || '[]').find((entry) => entry.name === process.argv[1]);
    process.stdout.write(app?.pm2_env?.status || '');
  " "$PM2_APP_NAME")"

  if [ "$status" != "online" ]; then
    pm2 logs "$PM2_APP_NAME" --lines 100 --nostream 2>&1 || true
    fail \
      "pm2 restart verification" \
      "PM2 did not report '$PM2_APP_NAME' as online after restart on $(hostname) at $(date -u)."
  fi
}

# Install repo-managed nginx snippets (currently the Open Graph link-preview
# routing) into /etc/nginx/snippets so prod picks up routing changes on update.
# The site config must include the snippet once (one-time manual step); until it
# does, this logs a NOTICE instead of failing.
install_nginx_snippets() {
  local src="$REPO_ROOT/scripts/nginx/tradetally-og.conf"
  local dest="/etc/nginx/snippets/tradetally-og.conf"

  if [ ! -f "$src" ]; then
    return
  fi

  if ! sudo test -f "$dest" || ! sudo cmp -s "$src" "$dest"; then
    sudo mkdir -p /etc/nginx/snippets
    sudo cp "$src" "$dest"
    log "Installed nginx snippet $dest"
  fi

  if ! sudo grep -Rqs "tradetally-og.conf" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null; then
    log "NOTICE: $dest is installed but not referenced by any nginx site config."
    log "NOTICE: One-time step - add this line inside the tradetally server { } block:"
    log "NOTICE:   include $dest;"
    log "NOTICE: Shared trade links will not unfurl into cards until it is included."
  fi
}

reload_nginx_if_available() {
  if ! command_exists nginx; then
    log "nginx is not installed; skipping reload"
    return
  fi

  if ! command_exists sudo; then
    log "sudo is unavailable; skipping nginx reload"
    return
  fi

  install_nginx_snippets

  if ! sudo nginx -t; then
    fail \
      "nginx config test" \
      "nginx configuration validation failed on $(hostname) at $(date -u). The backend restart completed, but nginx was not reloaded."
  fi

  sudo nginx -s reload || fail \
    "nginx reload" \
    "nginx reload failed on $(hostname) at $(date -u). The backend restart completed, but the web server was not reloaded."
}

load_notification_env
require_prerequisites
require_clean_git_state
ensure_pnpm
stash_local_changes_if_needed
sync_current_branch
sync_public_branch_if_needed

if [ "$UPDATED" -eq 0 ]; then
  log "No repository changes detected. Verifying running services anyway"
  restart_backend
  reload_nginx_if_available
  log "Done"
  exit 0
fi

run_step "Installing workspace dependencies" install_dependencies
run_step "Building frontend" build_frontend
run_step "Running backend migrations" run_backend_migrations
run_step "Restarting backend" restart_backend
run_step "Reloading nginx" reload_nginx_if_available

log "Done"
