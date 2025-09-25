#!/bin/bash

# PostgreSQL Auto-Migration Script
# Automatically handles PostgreSQL version upgrades using pg_upgrade

set -e

# Colors for logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[AUTO-MIGRATE]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[AUTO-MIGRATE]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[AUTO-MIGRATE]${NC} $1"
}

log_error() {
    echo -e "${RED}[AUTO-MIGRATE]${NC} $1"
}

# Check if migration is needed
check_migration_needed() {
    local data_dir="${PGDATA:-/var/lib/postgresql/data}"
    local version_file="$data_dir/PG_VERSION"
    
    # If no data directory exists, this is a fresh install
    if [[ ! -d "$data_dir" ]] || [[ ! -f "$version_file" ]]; then
        log "No existing database found. Proceeding with fresh installation."
        return 1  # No migration needed
    fi
    
    local data_version=$(cat "$version_file")
    local server_major="${PG_MAJOR:-16}"
    
    log "Existing database version: $data_version"
    log "Container PostgreSQL version: $server_major"
    
    if [[ "$data_version" != "$server_major" ]]; then
        log_warning "Version mismatch! Database: $data_version, Container: $server_major"
        
        # Only support specific upgrade paths
        if [[ "$data_version" == "15" && "$server_major" == "16" ]]; then
            log "Supported upgrade path detected: PostgreSQL 15 -> 16"
            return 0  # Migration needed and supported
        else
            log_error "Unsupported upgrade path: $data_version -> $server_major"
            log_error "Please migrate manually or use supported versions"
            exit 1
        fi
    fi
    
    log "Database version matches container version. No migration needed."
    return 1  # No migration needed
}

# Perform automatic upgrade using pg_upgrade
perform_upgrade() {
    local old_version="15"
    local new_version="16"
    local data_dir="${PGDATA:-/var/lib/postgresql/data}"
    local old_data="/var/lib/postgresql/data_old"
    local backup_dir="/var/lib/postgresql/migration-backup"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    
    log "Starting automatic upgrade from PostgreSQL $old_version to $new_version"
    
    # Create directories
    mkdir -p "$backup_dir"
    mkdir -p "/var/lib/postgresql/data_new"
    
    # Move old data
    log "Backing up old data directory..."
    mv "$data_dir" "$old_data"
    mkdir -p "$data_dir"
    
    # Initialize new database cluster
    log "Initializing new PostgreSQL $new_version cluster..."
    su-exec postgres initdb -D "$data_dir"
    
    # Set ownership
    chown -R postgres:postgres "$data_dir"
    chown -R postgres:postgres "$old_data"
    
    # Perform upgrade using pg_upgrade
    log "Running pg_upgrade from $old_version to $new_version..."
    
    # Change to postgres user and run pg_upgrade
    su-exec postgres bash -c "
        cd /var/lib/postgresql
        /usr/lib/postgresql/16/bin/pg_upgrade \\
            --old-datadir='$old_data' \\
            --new-datadir='$data_dir' \\
            --old-bindir='/usr/lib/postgresql/15/bin' \\
            --new-bindir='/usr/lib/postgresql/16/bin' \\
            --username=postgres \\
            --verbose
    "
    
    if [[ $? -eq 0 ]]; then
        log_success "Database upgrade completed successfully!"
        
        # Create a backup of old data before cleanup
        log "Creating backup of old database..."
        tar czf "$backup_dir/postgres_${old_version}_backup_${timestamp}.tar.gz" -C /var/lib/postgresql data_old
        
        # Clean up old data (comment out for safety)
        # rm -rf "$old_data"
        
        log_success "Migration completed. Old data backed up to $backup_dir/"
        return 0
    else
        log_error "Database upgrade failed!"
        
        # Restore old data
        log "Restoring original database..."
        rm -rf "$data_dir"
        mv "$old_data" "$data_dir"
        
        return 1
    fi
}

# Simple backup-restore approach (fallback)
perform_backup_restore() {
    local data_dir="${PGDATA:-/var/lib/postgresql/data}"
    local backup_dir="/var/lib/postgresql/migration-backup"
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="$backup_dir/database_backup_$timestamp.sql"
    
    log "Using backup-restore migration approach"
    
    mkdir -p "$backup_dir"
    
    # Start PostgreSQL 15 temporarily
    log "Starting PostgreSQL 15 for backup..."
    
    # This is complex in a single container, so we'll create a clear error message
    log_error "=== AUTOMATIC MIGRATION REQUIRED ==="
    log_error ""
    log_error "Your database was created with PostgreSQL 15 but this container runs PostgreSQL 16."
    log_error "Automatic migration is not yet implemented in this container."
    log_error ""
    log_error "Please run the migration script from your host:"
    log_error "  ./rescue-migrate-postgres-16.sh"
    log_error ""
    log_error "This will safely migrate your data to PostgreSQL 16."
    
    exit 1
}

# Main entrypoint logic
main() {
    log "PostgreSQL Auto-Migration Entrypoint Starting..."
    
    # Set default values
    export PGDATA="${PGDATA:-/var/lib/postgresql/data}"
    export PG_MAJOR="${PG_MAJOR:-16}"
    
    # Check if migration is needed
    if check_migration_needed; then
        log_warning "Database migration required"
        
        # For safety, we'll require manual migration for now
        # In production, you could enable perform_upgrade() here
        perform_backup_restore
        
        if [[ $? -ne 0 ]]; then
            log_error "Migration failed. Please check logs and run manual migration."
            exit 1
        fi
    fi
    
    log_success "Database ready. Starting PostgreSQL..."
    
    # Start PostgreSQL normally
    exec docker-entrypoint.sh "$@"
}

# Run main function
main "$@"