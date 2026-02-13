#!/bin/bash
#
# TradeTally Complete Restore Script
# Restores a full backup created by backup.sh including:
#   - PostgreSQL database (all tables)
#   - Trade images/attachments
#   - Diary attachments
#   - Data files
#
# Usage:
#   ./restore.sh backup_file.tar.gz              # Auto-detect Docker or local
#   ./restore.sh backup_file.tar.gz --docker     # Force Docker mode
#   ./restore.sh backup_file.tar.gz --local      # Force local mode
#   ./restore.sh backup_file.tar.gz --db-only    # Restore database only
#   ./restore.sh backup_file.tar.gz --files-only # Restore files only
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
MODE="auto"
RESTORE_DB=true
RESTORE_FILES=true
BACKUP_FILE=""
TEMP_DIR=""

# Docker container names (will be auto-detected)
DB_CONTAINER=""
APP_CONTAINER=""

# Database credentials
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-trader}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-tradetally}"

# Parse command line arguments
parse_args() {
    if [ $# -eq 0 ]; then
        echo "Usage: $0 backup_file.tar.gz [options]"
        echo ""
        echo "Options:"
        echo "  --docker       Force Docker mode"
        echo "  --local        Force local/native mode"
        echo "  --db-only      Restore database only"
        echo "  --files-only   Restore files only (no database)"
        echo "  --help, -h     Show this help message"
        exit 1
    fi

    while [[ $# -gt 0 ]]; do
        case $1 in
            --docker)
                MODE="docker"
                shift
                ;;
            --local)
                MODE="local"
                shift
                ;;
            --db-only)
                RESTORE_FILES=false
                shift
                ;;
            --files-only)
                RESTORE_DB=false
                shift
                ;;
            --help|-h)
                echo "TradeTally Restore Script"
                echo ""
                echo "Usage: $0 backup_file.tar.gz [options]"
                echo ""
                echo "Options:"
                echo "  --docker       Force Docker mode"
                echo "  --local        Force local/native mode"
                echo "  --db-only      Restore database only"
                echo "  --files-only   Restore files only (no database)"
                echo "  --help, -h     Show this help message"
                echo ""
                echo "Environment variables:"
                echo "  DB_HOST        Database host (default: localhost)"
                echo "  DB_PORT        Database port (default: 5432)"
                echo "  DB_USER        Database user (default: trader)"
                echo "  DB_PASSWORD    Database password"
                echo "  DB_NAME        Database name (default: tradetally)"
                exit 0
                ;;
            -*)
                echo -e "${RED}[ERROR] Unknown option: $1${NC}"
                exit 1
                ;;
            *)
                if [ -z "$BACKUP_FILE" ]; then
                    BACKUP_FILE="$1"
                else
                    echo -e "${RED}[ERROR] Unexpected argument: $1${NC}"
                    exit 1
                fi
                shift
                ;;
        esac
    done

    if [ -z "$BACKUP_FILE" ]; then
        echo -e "${RED}[ERROR] Backup file is required${NC}"
        exit 1
    fi

    if [ ! -f "$BACKUP_FILE" ]; then
        echo -e "${RED}[ERROR] Backup file not found: $BACKUP_FILE${NC}"
        exit 1
    fi
}

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Detect Docker containers (supports both prod and dev naming)
detect_containers() {
    # Try production containers first, then dev
    if docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^tradetally-db$"; then
        DB_CONTAINER="tradetally-db"
        APP_CONTAINER="tradetally-app"
    elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q "^tradetally-db-dev$"; then
        DB_CONTAINER="tradetally-db-dev"
        APP_CONTAINER="tradetally-app-dev"
    fi
}

# Detect if running in Docker environment
detect_mode() {
    if [ "$MODE" != "auto" ]; then
        detect_containers
        return
    fi

    detect_containers

    if [ -n "$DB_CONTAINER" ]; then
        MODE="docker"
        log_info "Detected Docker environment (containers: $DB_CONTAINER, $APP_CONTAINER)"
    else
        MODE="local"
        log_info "Using local/native mode"
    fi
}

# Load environment variables
load_env() {
    local env_file=""

    if [ -f ".env" ]; then
        env_file=".env"
    elif [ -f "backend/.env" ]; then
        env_file="backend/.env"
    elif [ -f "../backend/.env" ]; then
        env_file="../backend/.env"
    fi

    if [ -n "$env_file" ]; then
        log_info "Loading environment from $env_file"
        set -a
        . "$env_file"
        set +a
    fi
}

# Verify checksum if available
verify_checksum() {
    local checksum_file="${BACKUP_FILE}.sha256"

    if [ -f "$checksum_file" ]; then
        log_info "Verifying backup checksum..."

        if command -v sha256sum &> /dev/null; then
            if sha256sum -c "$checksum_file" &> /dev/null; then
                log_success "Checksum verified"
            else
                log_error "Checksum verification failed!"
                exit 1
            fi
        elif command -v shasum &> /dev/null; then
            if shasum -a 256 -c "$checksum_file" &> /dev/null; then
                log_success "Checksum verified"
            else
                log_error "Checksum verification failed!"
                exit 1
            fi
        else
            log_warn "No checksum tool available, skipping verification"
        fi
    else
        log_warn "No checksum file found, skipping verification"
    fi
}

# Extract backup archive
extract_backup() {
    log_info "Extracting backup archive..."

    TEMP_DIR=$(mktemp -d)
    tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

    # Verify manifest exists
    if [ ! -f "$TEMP_DIR/manifest.json" ]; then
        log_error "Invalid backup: manifest.json not found"
        exit 1
    fi

    log_success "Backup extracted to temporary directory"

    # Display backup info
    if command -v jq &> /dev/null; then
        echo ""
        log_info "Backup information:"
        jq -r '.created_at // "unknown"' "$TEMP_DIR/manifest.json" | xargs -I {} echo "  Created: {}"
        jq -r '.tradetally.database.users // "unknown"' "$TEMP_DIR/manifest.json" | xargs -I {} echo "  Users: {}"
        jq -r '.tradetally.database.trades // "unknown"' "$TEMP_DIR/manifest.json" | xargs -I {} echo "  Trades: {}"
        jq -r '.tradetally.database.diary_entries // "unknown"' "$TEMP_DIR/manifest.json" | xargs -I {} echo "  Diary entries: {}"
        jq -r '.tradetally.files.uploads // "unknown"' "$TEMP_DIR/manifest.json" | xargs -I {} echo "  Upload files: {}"
        echo ""
    fi
}

# Confirm restore with user
confirm_restore() {
    echo ""
    echo -e "${YELLOW}=========================================="
    echo "WARNING: This will overwrite existing data!"
    echo "==========================================${NC}"
    echo ""
    echo "Mode: $MODE"
    echo "Database restore: $RESTORE_DB"
    echo "Files restore: $RESTORE_FILES"
    echo ""

    read -p "Are you sure you want to continue? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        log_info "Restore cancelled"
        exit 0
    fi

    echo ""
}

# Restore PostgreSQL database
restore_database() {
    if [ "$RESTORE_DB" != "true" ]; then
        log_info "Skipping database restore (--files-only)"
        return
    fi

    local dump_file="$TEMP_DIR/database/tradetally.sql"

    if [ ! -f "$dump_file" ]; then
        log_error "Database dump not found in backup"
        exit 1
    fi

    log_info "Restoring PostgreSQL database..."

    if [ "$MODE" == "docker" ]; then
        if [ -z "$DB_CONTAINER" ] || ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
            log_error "Database container is not running (tried tradetally-db and tradetally-db-dev)"
            exit 1
        fi

        # Drop and recreate database
        log_info "Dropping existing database..."
        docker exec "$DB_CONTAINER" dropdb -U "$DB_USER" --if-exists "$DB_NAME" || true
        docker exec "$DB_CONTAINER" createdb -U "$DB_USER" "$DB_NAME"

        # Restore from dump
        log_info "Restoring database from backup..."
        docker exec -i "$DB_CONTAINER" psql -U "$DB_USER" "$DB_NAME" < "$dump_file"
    else
        if [ -z "$DB_PASSWORD" ]; then
            log_warn "DB_PASSWORD not set"
        fi

        # Drop and recreate database
        log_info "Dropping existing database..."
        PGPASSWORD="$DB_PASSWORD" dropdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" --if-exists "$DB_NAME" || true
        PGPASSWORD="$DB_PASSWORD" createdb -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME"

        # Restore from dump
        log_info "Restoring database from backup..."
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" < "$dump_file"
    fi

    log_success "Database restored successfully"
}

# Restore uploaded files
restore_uploads() {
    if [ "$RESTORE_FILES" != "true" ]; then
        log_info "Skipping file restore (--db-only)"
        return
    fi

    local uploads_dir="$TEMP_DIR/uploads"

    if [ ! -d "$uploads_dir" ] || [ -z "$(ls -A "$uploads_dir" 2>/dev/null)" ]; then
        log_warn "No upload files found in backup"
        return
    fi

    log_info "Restoring uploaded files..."

    if [ "$MODE" == "docker" ]; then
        if [ -n "$APP_CONTAINER" ] && docker ps --format '{{.Names}}' | grep -q "^${APP_CONTAINER}$"; then
            # Create uploads directory in container if needed
            docker exec "$APP_CONTAINER" mkdir -p /app/backend/uploads

            # Copy files to container
            docker cp "$uploads_dir/." "$APP_CONTAINER:/app/backend/uploads/"
            log_success "Uploads restored to Docker container at /app/backend/uploads"
        else
            log_warn "App container not running. Saving uploads locally..."
            mkdir -p backend/uploads
            cp -r "$uploads_dir"/* backend/uploads/ 2>/dev/null || true
        fi
    else
        # Local mode: copy to backend/uploads
        local target_dirs=(
            "backend/uploads"
            "../backend/uploads"
        )

        local restored=false
        for dir in "${target_dirs[@]}"; do
            local parent_dir=$(dirname "$dir")
            if [ -d "$parent_dir" ]; then
                mkdir -p "$dir"
                cp -r "$uploads_dir"/* "$dir/" 2>/dev/null || true
                log_success "Uploads restored to $dir"
                restored=true
                break
            fi
        done

        if [ "$restored" != "true" ]; then
            mkdir -p backend/uploads
            cp -r "$uploads_dir"/* backend/uploads/ 2>/dev/null || true
            log_success "Uploads restored to backend/uploads"
        fi
    fi

    local file_count=$(find "$uploads_dir" -type f | wc -l | tr -d ' ')
    log_success "Restored $file_count upload files"
}

# Restore data directory
restore_data() {
    if [ "$RESTORE_FILES" != "true" ]; then
        return
    fi

    local data_dir="$TEMP_DIR/data"

    if [ ! -d "$data_dir" ] || [ -z "$(ls -A "$data_dir" 2>/dev/null)" ]; then
        log_warn "No data files found in backup"
        return
    fi

    log_info "Restoring data files..."

    if [ "$MODE" == "docker" ]; then
        if [ -n "$APP_CONTAINER" ] && docker ps --format '{{.Names}}' | grep -q "^${APP_CONTAINER}$"; then
            docker exec "$APP_CONTAINER" mkdir -p /app/backend/src/data
            docker cp "$data_dir/." "$APP_CONTAINER:/app/backend/src/data/"
            log_success "Data files restored to Docker container"
        else
            log_warn "App container not running. Saving data locally..."
            mkdir -p backend/src/data
            cp -r "$data_dir"/* backend/src/data/ 2>/dev/null || true
        fi
    else
        local target_dirs=(
            "backend/src/data"
            "../backend/src/data"
        )

        for dir in "${target_dirs[@]}"; do
            local parent_dir=$(dirname "$dir")
            if [ -d "$parent_dir" ]; then
                mkdir -p "$dir"
                cp -r "$data_dir"/* "$dir/" 2>/dev/null || true
                log_success "Data files restored to $dir"
                break
            fi
        done
    fi
}

# Cleanup temporary files
cleanup() {
    if [ -n "$TEMP_DIR" ] && [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
}

# Main execution
main() {
    echo ""
    echo "=========================================="
    echo "TradeTally Complete Restore"
    echo "=========================================="
    echo ""

    # Parse arguments
    parse_args "$@"

    # Set up cleanup trap
    trap cleanup EXIT

    # Load config and detect mode
    load_env
    detect_mode

    log_info "Restore mode: $MODE"
    log_info "Backup file: $BACKUP_FILE"
    echo ""

    # Verify and extract
    verify_checksum
    extract_backup

    # Confirm with user
    confirm_restore

    # Run restore steps
    restore_database
    restore_uploads
    restore_data

    echo ""
    echo "=========================================="
    echo -e "${GREEN}RESTORE COMPLETE${NC}"
    echo "=========================================="
    echo ""

    if [ "$MODE" == "docker" ]; then
        log_info "You may need to restart the application container:"
        echo "  docker restart $APP_CONTAINER"
    fi

    echo ""
    log_success "Restore completed successfully!"
}

# Run main function
main "$@"
