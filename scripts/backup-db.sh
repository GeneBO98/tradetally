#!/bin/bash
# Backup the trade_journal database to a timestamped file
set -e

BACKUP_DIR="/Users/toto/Projects/trade-journal/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/trade_journal_${TIMESTAMP}.sql.gz"

mkdir -p "$BACKUP_DIR"

echo "Backing up trade_journal to ${BACKUP_FILE}..."
pg_dump -U toto trade_journal | gzip > "$BACKUP_FILE"

# Keep only last 30 backups
cd "$BACKUP_DIR"
ls -t trade_journal_*.sql.gz | tail -n +31 | xargs -r rm --

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup complete: ${BACKUP_FILE} (${SIZE})"
