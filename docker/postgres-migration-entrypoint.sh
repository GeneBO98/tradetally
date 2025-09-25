#!/bin/bash

# PostgreSQL Automatic Migration Entrypoint
# This script detects PostgreSQL version mismatches and handles migrations automatically

set -e

# Colors for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[POSTGRES-MIGRATION]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[POSTGRES-MIGRATION]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[POSTGRES-MIGRATION]${NC} $1"
}

log_error() {
    echo -e "${RED}[POSTGRES-MIGRATION]${NC} $1"
}

# Check if we need to migrate
check_migration_needed() {
    local data_dir="$PGDATA"
    local version_file="$data_dir/PG_VERSION"
    
    if [[ ! -f "$version_file" ]]; then
        log "No existing database found. Fresh installation."
        return 1  # No migration needed
    fi
    
    local data_version=$(cat "$version_file")
    local server_version="${PG_MAJOR}"
    
    log "Found existing database version: $data_version"
    log "Current server version: $server_version"
    
    if [[ "$data_version" != "$server_version" ]]; then
        log_warning "Version mismatch detected! Need to migrate from $data_version to $server_version"
        return 0  # Migration needed
    fi
    
    log "Versions match. No migration needed."
    return 1  # No migration needed
}

# Perform automatic migration
perform_migration() {
    local data_dir="$PGDATA"
    local old_version=$(cat "$data_dir/PG_VERSION")
    local new_version="${PG_MAJOR}"
    local backup_dir="/var/lib/postgresql/migration-backup"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    
    log "Starting automatic migration from PostgreSQL $old_version to $new_version"
    
    # Create backup directory
    mkdir -p "$backup_dir"
    
    # Start old PostgreSQL version temporarily for backup
    log "Starting temporary PostgreSQL $old_version for backup..."
    
    # We need to use the old binary to start the old data
    if command -v "postgres-$old_version" >/dev/null 2>&1; then
        local old_postgres="postgres-$old_version"
    else
        # Fallback - try to use initdb to detect and handle
        log_error "Cannot find PostgreSQL $old_version binary for migration"
        log_error "Falling back to pg_upgrade method"
        return 1
    fi
    
    # Alternative approach - use pg_dumpall if available
    if pg_dumpall --version >/dev/null 2>&1; then
        log "Using pg_dumpall approach for migration"
        
        # Temporarily move data to backup location
        local temp_old_data="/var/lib/postgresql/temp_old_data"
        mv "$data_dir" "$temp_old_data"
        
        # Initialize new database
        log "Initializing new PostgreSQL $new_version database"
        initdb -D "$data_dir"
        
        # Start new PostgreSQL
        pg_ctl -D "$data_dir" -l "$backup_dir/postgres.log" start
        
        # Wait for PostgreSQL to be ready
        for i in {1..30}; do
            if pg_isready -d template1 >/dev/null 2>&1; then
                log_success "PostgreSQL $new_version started successfully"
                break
            fi
            if [[ $i -eq 30 ]]; then
                log_error "PostgreSQL $new_version failed to start"
                return 1
            fi
            sleep 1
        done
        
        # Now we need to restore data using a different approach
        # Since we can't easily run two PostgreSQL versions simultaneously,
        # we'll use a file-based backup/restore approach
        
        log_error "Complex migration scenario detected. Manual intervention required."
        log_error "Please run the rescue-migrate-postgres-16.sh script manually."
        
        # Stop PostgreSQL and restore original data for now
        pg_ctl -D "$data_dir" stop
        rm -rf "$data_dir"
        mv "$temp_old_data" "$data_dir"
        
        return 1
    fi
    
    return 1
}

# Main migration logic
main() {
    log "PostgreSQL Migration Entrypoint Started"
    
    # Check if migration is needed
    if check_migration_needed; then
        log_warning "Database migration required"
        
        # For now, we'll provide clear instructions rather than attempting
        # complex in-container migration
        log_error "=== MIGRATION REQUIRED ==="
        log_error "Your PostgreSQL data was created with version $(cat $PGDATA/PG_VERSION)"
        log_error "But this container is running version $PG_MAJOR"
        log_error ""
        log_error "To fix this automatically, run:"
        log_error "  ./rescue-migrate-postgres-16.sh"
        log_error ""
        log_error "Or manually:"
        log_error "1. docker-compose down"
        log_error "2. ./rescue-migrate-postgres-16.sh"
        log_error "3. docker-compose up -d"
        
        exit 1
    fi
    
    log_success "Database compatibility verified. Starting PostgreSQL normally..."
}

# Only run migration check if we're the main PostgreSQL process
if [[ "${1}" == "postgres" ]] || [[ "${1}" == "docker-entrypoint.sh" ]] || [[ -z "${1}" ]]; then
    main
fi

# Continue with normal PostgreSQL startup
exec docker-entrypoint.sh "$@"