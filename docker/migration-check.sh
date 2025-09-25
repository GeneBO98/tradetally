#!/bin/bash

# PostgreSQL Migration Check Script
# This runs as an init container to handle database version migrations

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[MIGRATION-CHECK]${NC} $1"; }
log_success() { echo -e "${GREEN}[MIGRATION-CHECK]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[MIGRATION-CHECK]${NC} $1"; }
log_error() { echo -e "${RED}[MIGRATION-CHECK]${NC} $1"; }

PGDATA="/var/lib/postgresql/data"
VERSION_FILE="$PGDATA/PG_VERSION"
BACKUP_DIR="/var/lib/postgresql/backup"

log "Starting PostgreSQL migration check..."

# Check if data directory exists and has data
if [[ ! -d "$PGDATA" ]] || [[ ! -f "$VERSION_FILE" ]]; then
    log "No existing database found. This will be a fresh PostgreSQL 16 installation."
    exit 0  # Success - no migration needed
fi

# Check version
DATA_VERSION=$(cat "$VERSION_FILE")
log "Found existing database with version: $DATA_VERSION"

if [[ "$DATA_VERSION" == "16" ]]; then
    log_success "Database is already PostgreSQL 16. No migration needed."
    exit 0  # Success
fi

if [[ "$DATA_VERSION" == "15" ]]; then
    log_warning "PostgreSQL 15 database detected. Migration needed to PostgreSQL 16."
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    log "Creating backup before migration..."
    
    # Start PostgreSQL 15 temporarily for backup
    log "Starting PostgreSQL 15 for backup..."
    
    # Initialize and start PostgreSQL 15
    su-exec postgres postgres -D "$PGDATA" &
    PG_PID=$!
    
    # Wait for PostgreSQL to start
    for i in {1..30}; do
        if su-exec postgres pg_isready -U "${POSTGRES_USER:-trader}" -d "${POSTGRES_DB:-tradetally}" >/dev/null 2>&1; then
            log_success "PostgreSQL 15 started for backup"
            break
        fi
        if [[ $i -eq 30 ]]; then
            log_error "Failed to start PostgreSQL 15 for backup"
            exit 1
        fi
        sleep 1
    done
    
    # Create backup
    BACKUP_FILE="$BACKUP_DIR/pre_migration_backup_$(date +%Y%m%d_%H%M%S).sql"
    log "Creating backup: $BACKUP_FILE"
    
    su-exec postgres pg_dumpall -U "${POSTGRES_USER:-trader}" > "$BACKUP_FILE" || {
        log_error "Backup failed!"
        kill $PG_PID 2>/dev/null || true
        exit 1
    }
    
    # Stop PostgreSQL 15
    kill $PG_PID
    wait $PG_PID 2>/dev/null || true
    
    log_success "Backup created successfully"
    
    # Move old data
    mv "$PGDATA" "$PGDATA.pg15"
    mkdir -p "$PGDATA"
    
    # Initialize PostgreSQL 16
    log "Initializing PostgreSQL 16..."
    su-exec postgres initdb -D "$PGDATA"
    
    # Start PostgreSQL 16 temporarily
    log "Starting PostgreSQL 16 for restore..."
    su-exec postgres postgres -D "$PGDATA" &
    PG_PID=$!
    
    # Wait for PostgreSQL 16 to start
    for i in {1..30}; do
        if su-exec postgres pg_isready -U "${POSTGRES_USER:-trader}" -d "${POSTGRES_DB:-tradetally}" >/dev/null 2>&1; then
            log_success "PostgreSQL 16 started"
            break
        fi
        if [[ $i -eq 30 ]]; then
            log_error "Failed to start PostgreSQL 16"
            exit 1
        fi
        sleep 1
    done
    
    # Restore data
    log "Restoring data to PostgreSQL 16..."
    su-exec postgres psql -U "${POSTGRES_USER:-trader}" -d template1 < "$BACKUP_FILE" || {
        log_error "Data restore failed!"
        kill $PG_PID 2>/dev/null || true
        
        # Restore original data
        rm -rf "$PGDATA"
        mv "$PGDATA.pg15" "$PGDATA"
        exit 1
    }
    
    # Stop PostgreSQL 16
    kill $PG_PID
    wait $PG_PID 2>/dev/null || true
    
    # Clean up old data (keep backup for safety)
    rm -rf "$PGDATA.pg15"
    
    log_success "Migration completed successfully!"
    log "Backup saved at: $BACKUP_FILE"
    
    exit 0  # Success
else
    log_error "Unsupported PostgreSQL version: $DATA_VERSION"
    log_error "Only migration from PostgreSQL 15 to 16 is supported"
    exit 1
fi