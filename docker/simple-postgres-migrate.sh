#!/bin/bash

# Simple PostgreSQL Migration Script
# This script runs the manual migration using docker run instead of trying to do it in-container

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[MIGRATE]${NC} $1"; }
log_success() { echo -e "${GREEN}[MIGRATE]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[MIGRATE]${NC} $1"; }
log_error() { echo -e "${RED}[MIGRATE]${NC} $1"; }

# Load environment variables
if [[ -f ".env" ]]; then
    source .env
else
    log_warning "No .env file found, using defaults"
fi

# Set defaults
DB_USER=${DB_USER:-trader}
DB_PASSWORD=${DB_PASSWORD:-trader_password}
DB_NAME=${DB_NAME:-tradetally}
AUTO_MIGRATE_POSTGRES=${AUTO_MIGRATE_POSTGRES:-false}

log "PostgreSQL Migration Check Starting..."
log "Auto-migrate enabled: $AUTO_MIGRATE_POSTGRES"

# Check if auto-migration is enabled
if [[ "$AUTO_MIGRATE_POSTGRES" != "true" ]]; then
    log "Auto-migration disabled. Checking for version compatibility..."
    
    # Just check if there's a version mismatch and provide helpful message
    VERSION_CHECK=$(docker run --rm -v tradetally_postgres_data_dev:/data alpine sh -c 'if [[ -f /data/PG_VERSION ]]; then cat /data/PG_VERSION; else echo "none"; fi' 2>/dev/null || echo "none")
    
    if [[ "$VERSION_CHECK" == "15" ]]; then
        log_error "=== POSTGRESQL VERSION MISMATCH DETECTED ==="
        log_error "Your database is PostgreSQL 15, but the container expects PostgreSQL 16"
        log_error ""
        log_error "To enable automatic migration, set in your .env file:"
        log_error "AUTO_MIGRATE_POSTGRES=true"
        log_error ""
        log_error "Or run the manual migration script:"
        log_error "./rescue-migrate-postgres-16.sh"
        exit 1
    fi
    
    log_success "No migration needed or auto-migration disabled"
    exit 0
fi

log "Auto-migration enabled. Performing migration check..."

# Create backup directory
BACKUP_DIR="./postgres-migration-backup"
mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Check current database version
VERSION_CHECK=$(docker run --rm -v tradetally_postgres_data_dev:/data alpine sh -c 'if [[ -f /data/PG_VERSION ]]; then cat /data/PG_VERSION; else echo "none"; fi' 2>/dev/null || echo "none")

log "Current database version: $VERSION_CHECK"

if [[ "$VERSION_CHECK" == "none" ]]; then
    log "No existing database found. Will create fresh PostgreSQL 16 database."
    exit 0
fi

if [[ "$VERSION_CHECK" == "16" ]]; then
    log_success "Database is already PostgreSQL 16. No migration needed."
    exit 0
fi

if [[ "$VERSION_CHECK" == "15" ]]; then
    log_warning "PostgreSQL 15 database detected. Starting migration to PostgreSQL 16..."
    
    # Step 1: Create backup using PostgreSQL 15
    log "Creating backup from PostgreSQL 15..."
    BACKUP_FILE="$BACKUP_DIR/migration_backup_$TIMESTAMP.sql"
    
    docker run --rm \
        -v tradetally_postgres_data_dev:/var/lib/postgresql/data \
        -v "$(pwd)/$BACKUP_DIR":/backup \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_PASSWORD="$DB_PASSWORD" \
        -e POSTGRES_DB="$DB_NAME" \
        postgres:15-alpine \
        sh -c '
            postgres &
            PG_PID=$!
            
            # Wait for PostgreSQL to start
            for i in $(seq 1 30); do
                if pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; then
                    echo "PostgreSQL 15 ready for backup"
                    break
                fi
                if [ $i -eq 30 ]; then
                    echo "Failed to start PostgreSQL 15"
                    exit 1
                fi
                sleep 1
            done
            
            # Create backup
            pg_dumpall -U "$POSTGRES_USER" > /backup/migration_backup_'$TIMESTAMP'.sql
            
            # Stop PostgreSQL
            kill $PG_PID
            wait $PG_PID 2>/dev/null || true
        '
    
    if [[ $? -ne 0 ]]; then
        log_error "Backup failed!"
        exit 1
    fi
    
    log_success "Backup created: $BACKUP_FILE"
    
    # Step 2: Remove old data volume
    log "Removing PostgreSQL 15 data volume..."
    docker volume rm tradetally_postgres_data_dev || true
    
    # Step 3: Initialize PostgreSQL 16 and restore data
    log "Initializing PostgreSQL 16 and restoring data..."
    
    docker run --rm \
        -v tradetally_postgres_data_dev:/var/lib/postgresql/data \
        -v "$(pwd)/$BACKUP_DIR":/backup \
        -e POSTGRES_USER="$DB_USER" \
        -e POSTGRES_PASSWORD="$DB_PASSWORD" \
        -e POSTGRES_DB="$DB_NAME" \
        postgres:16-alpine \
        sh -c '
            # Initialize new database
            initdb -D /var/lib/postgresql/data
            
            # Start PostgreSQL 16
            postgres &
            PG_PID=$!
            
            # Wait for PostgreSQL to start
            for i in $(seq 1 30); do
                if pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"; then
                    echo "PostgreSQL 16 ready for restore"
                    break
                fi
                if [ $i -eq 30 ]; then
                    echo "Failed to start PostgreSQL 16"
                    exit 1
                fi
                sleep 1
            done
            
            # Restore data
            psql -U "$POSTGRES_USER" -d template1 < /backup/migration_backup_'$TIMESTAMP'.sql
            
            # Stop PostgreSQL
            kill $PG_PID
            wait $PG_PID 2>/dev/null || true
        '
    
    if [[ $? -eq 0 ]]; then
        log_success "Migration completed successfully!"
        log "Database upgraded from PostgreSQL 15 to 16"
        log "Backup saved at: $BACKUP_FILE"
    else
        log_error "Migration failed during restore!"
        exit 1
    fi
    
else
    log_error "Unsupported database version: $VERSION_CHECK"
    log_error "Only PostgreSQL 15 to 16 migration is supported"
    exit 1
fi

log_success "Migration process completed!"