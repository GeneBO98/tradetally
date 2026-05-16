#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -f "$ROOT_DIR/backend/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/backend/.env"
  set +a
fi
if [[ -f "$ROOT_DIR/backend/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT_DIR/backend/.env.local"
  set +a
fi

BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/restore-drill}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SOURCE_DB="${DB_NAME:-tradetally}"
RESTORE_DB="${RESTORE_DB_NAME:-${SOURCE_DB}_restore_drill_${TIMESTAMP}}"
RESTORE_DRILL_OFFSITE_DIR="${RESTORE_DRILL_OFFSITE_DIR:-}"
RESTORE_DRILL_OFFSITE_URI="${RESTORE_DRILL_OFFSITE_URI:-}"
RESTORE_DRILL_SIGNED_UPLOAD_URL="${RESTORE_DRILL_SIGNED_UPLOAD_URL:-}"
RESTORE_DRILL_SIGNED_DOWNLOAD_URL="${RESTORE_DRILL_SIGNED_DOWNLOAD_URL:-}"
RESTORE_DRILL_ENCRYPTION_KEY="${RESTORE_DRILL_ENCRYPTION_KEY:-}"
PGHOST="${DB_HOST:-localhost}"
PGPORT="${DB_PORT:-5432}"
PGUSER="${DB_USER:-postgres}"
export PGPASSWORD="${DB_PASSWORD:-postgres}"

mkdir -p "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/${SOURCE_DB}_${TIMESTAMP}.dump"

echo "Creating backup $BACKUP_FILE"
pg_dump --host "$PGHOST" --port "$PGPORT" --username "$PGUSER" --format custom --file "$BACKUP_FILE" "$SOURCE_DB"

RESTORE_SOURCE_FILE="$BACKUP_FILE"
if [[ -n "$RESTORE_DRILL_ENCRYPTION_KEY" ]]; then
  ENCRYPTED_BACKUP_FILE="${BACKUP_FILE}.enc"
  echo "Encrypting backup $ENCRYPTED_BACKUP_FILE"
  openssl enc -aes-256-cbc -pbkdf2 -salt \
    -in "$BACKUP_FILE" \
    -out "$ENCRYPTED_BACKUP_FILE" \
    -pass env:RESTORE_DRILL_ENCRYPTION_KEY

  DECRYPTED_BACKUP_FILE="$BACKUP_DIR/${SOURCE_DB}_${TIMESTAMP}.decrypted.dump"
  echo "Validating encrypted backup can be decrypted"
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "$ENCRYPTED_BACKUP_FILE" \
    -out "$DECRYPTED_BACKUP_FILE" \
    -pass env:RESTORE_DRILL_ENCRYPTION_KEY
  RESTORE_SOURCE_FILE="$DECRYPTED_BACKUP_FILE"
fi

OFFSITE_SOURCE_FILE="${ENCRYPTED_BACKUP_FILE:-$BACKUP_FILE}"
if [[ -n "$RESTORE_DRILL_OFFSITE_DIR" ]]; then
  mkdir -p "$RESTORE_DRILL_OFFSITE_DIR"
  OFFSITE_TARGET="$RESTORE_DRILL_OFFSITE_DIR/$(basename "$OFFSITE_SOURCE_FILE")"
  echo "Copying backup to offsite directory $OFFSITE_TARGET"
  cp "$OFFSITE_SOURCE_FILE" "$OFFSITE_TARGET"
  test -s "$OFFSITE_TARGET"
fi

if [[ "$RESTORE_DRILL_OFFSITE_URI" == s3://* ]]; then
  if ! command -v aws >/dev/null 2>&1; then
    echo "aws CLI is required for RESTORE_DRILL_OFFSITE_URI=$RESTORE_DRILL_OFFSITE_URI" >&2
    exit 1
  fi
  echo "Copying backup to offsite target $RESTORE_DRILL_OFFSITE_URI"
  aws s3 cp "$OFFSITE_SOURCE_FILE" "$RESTORE_DRILL_OFFSITE_URI/$(basename "$OFFSITE_SOURCE_FILE")"
fi

if [[ "$RESTORE_DRILL_OFFSITE_URI" == gs://* ]]; then
  echo "Copying backup to GCS offsite target $RESTORE_DRILL_OFFSITE_URI"
  if command -v gsutil >/dev/null 2>&1; then
    gsutil cp "$OFFSITE_SOURCE_FILE" "$RESTORE_DRILL_OFFSITE_URI/$(basename "$OFFSITE_SOURCE_FILE")"
  elif command -v gcloud >/dev/null 2>&1; then
    gcloud storage cp "$OFFSITE_SOURCE_FILE" "$RESTORE_DRILL_OFFSITE_URI/$(basename "$OFFSITE_SOURCE_FILE")"
  else
    echo "gsutil or gcloud is required for RESTORE_DRILL_OFFSITE_URI=$RESTORE_DRILL_OFFSITE_URI" >&2
    exit 1
  fi
fi

if [[ "$RESTORE_DRILL_OFFSITE_URI" == https://* ]]; then
  echo "Uploading backup to signed HTTPS offsite target"
  curl --fail --silent --show-error --request PUT --upload-file "$OFFSITE_SOURCE_FILE" "$RESTORE_DRILL_OFFSITE_URI"
fi

if [[ -n "$RESTORE_DRILL_SIGNED_UPLOAD_URL" ]]; then
  echo "Uploading backup to signed test bucket URL"
  curl --fail --silent --show-error --request PUT --upload-file "$OFFSITE_SOURCE_FILE" "$RESTORE_DRILL_SIGNED_UPLOAD_URL"
fi

if [[ -n "$RESTORE_DRILL_SIGNED_DOWNLOAD_URL" ]]; then
  SIGNED_DOWNLOAD_FILE="$BACKUP_DIR/$(basename "$OFFSITE_SOURCE_FILE").signed-download"
  echo "Downloading signed test bucket object for checksum validation"
  curl --fail --silent --show-error --location "$RESTORE_DRILL_SIGNED_DOWNLOAD_URL" --output "$SIGNED_DOWNLOAD_FILE"
  cmp "$OFFSITE_SOURCE_FILE" "$SIGNED_DOWNLOAD_FILE"
fi

echo "Creating restore database $RESTORE_DB"
createdb --host "$PGHOST" --port "$PGPORT" --username "$PGUSER" "$RESTORE_DB"

cleanup() {
  dropdb --if-exists --host "$PGHOST" --port "$PGPORT" --username "$PGUSER" "$RESTORE_DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

psql --host "$PGHOST" --port "$PGPORT" --username "$PGUSER" --dbname "$RESTORE_DB" --quiet \
  --command "CREATE SCHEMA IF NOT EXISTS journal_ext;"

echo "Restoring backup into $RESTORE_DB"
pg_restore --host "$PGHOST" --port "$PGPORT" --username "$PGUSER" --dbname "$RESTORE_DB" --clean --if-exists "$RESTORE_SOURCE_FILE"

echo "Validating restored schema and critical tables"
psql --host "$PGHOST" --port "$PGPORT" --username "$PGUSER" --dbname "$RESTORE_DB" --tuples-only --no-align <<'SQL'
SELECT 'users=' || COUNT(*) FROM users;
SELECT 'trades=' || COUNT(*) FROM trades;
SELECT 'execution_runs=' || COUNT(*) FROM execution_runs;
SELECT 'migrations=' || COUNT(*) FROM migrations;
SQL

echo "Restore drill completed successfully"
