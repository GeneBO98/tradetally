#!/bin/bash
#
# TradeTally Complete Backup Script
# Creates a full backup of all user data including:
#   - PostgreSQL database (all tables)
#   - Trade images/attachments
#   - Diary attachments
#   - Data files (backups, caches)
#   - Configuration files
#
# Usage:
#   ./backup.sh                    # Auto-detect Docker or local
#   ./backup.sh --docker           # Force Docker mode
#   ./backup.sh --local            # Force local mode
#   ./backup.sh --output /path     # Custom output directory
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default configuration
BACKUP_DIR="${BACKUP_OUTPUT:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_NAME="tradetally_backup_${TIMESTAMP}"
TEMP_DIR="/tmp/${BACKUP_NAME}"
MODE="auto"

# Docker container names (will be auto-detected)
DB_CONTAINER=""
APP_CONTAINER=""

# Database credentials (will be loaded from .env or Docker)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-trader}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_NAME="${DB_NAME:-tradetally}"

# Parse command line arguments
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
        --output)
            BACKUP_DIR="$2"
            shift 2
            ;;
        --help|-h)
            echo "TradeTally Backup Script"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --docker       Force Docker mode"
            echo "  --local        Force local/native mode"
            echo "  --output DIR   Custom output directory (default: ./backups)"
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
        *)
            echo -e "${RED}[ERROR] Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

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
        # Even in forced mode, detect container names
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

# Load environment variables from .env file if available
load_env() {
    local env_file=""

    # Try to find .env file
    if [ -f ".env" ]; then
        env_file=".env"
    elif [ -f "backend/.env" ]; then
        env_file="backend/.env"
    elif [ -f "../backend/.env" ]; then
        env_file="../backend/.env"
    fi

    if [ -n "$env_file" ]; then
        log_info "Loading environment from $env_file"
        # Export variables from .env file, ignoring comments and empty lines
        set -a
        . "$env_file"
        set +a
    fi
}

# Create backup directory structure
create_backup_dirs() {
    log_info "Creating backup directory structure..."

    mkdir -p "$BACKUP_DIR"
    mkdir -p "$TEMP_DIR"
    mkdir -p "$TEMP_DIR/database"
    mkdir -p "$TEMP_DIR/uploads"
    mkdir -p "$TEMP_DIR/data"
    mkdir -p "$TEMP_DIR/config"
}

# Backup PostgreSQL database
backup_database() {
    log_info "Backing up PostgreSQL database..."

    local dump_file="$TEMP_DIR/database/tradetally.sql"

    if [ "$MODE" == "docker" ]; then
        # Docker mode: use docker exec
        if [ -z "$DB_CONTAINER" ] || ! docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
            log_error "Database container is not running (tried tradetally-db and tradetally-db-dev)"
            exit 1
        fi

        docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$dump_file"
    else
        # Local mode: use pg_dump directly
        if [ -z "$DB_PASSWORD" ]; then
            log_warn "DB_PASSWORD not set. Attempting connection without password..."
            PGPASSWORD="" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" > "$dump_file"
        else
            PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" "$DB_NAME" > "$dump_file"
        fi
    fi

    local dump_size=$(du -h "$dump_file" | cut -f1)
    log_success "Database backup complete ($dump_size)"
}

# Backup uploaded files (trade images, diary attachments, avatars)
backup_uploads() {
    log_info "Backing up uploaded files..."

    local uploads_backed_up=0

    if [ "$MODE" == "docker" ]; then
        # Docker mode: copy from container
        if [ -n "$APP_CONTAINER" ] && docker ps --format '{{.Names}}' | grep -q "^${APP_CONTAINER}$"; then
            # Check if uploads directory exists in container at /app/backend/uploads
            if docker exec "$APP_CONTAINER" test -d /app/backend/uploads 2>/dev/null; then
                # Check if there are any files
                local file_count=$(docker exec "$APP_CONTAINER" find /app/backend/uploads -type f 2>/dev/null | wc -l | tr -d ' ')
                if [ "$file_count" -gt 0 ]; then
                    docker cp "$APP_CONTAINER:/app/backend/uploads/." "$TEMP_DIR/uploads/"
                    uploads_backed_up=1
                    log_success "Copied $file_count files from Docker container (/app/backend/uploads)"
                else
                    log_warn "Uploads directory exists but is empty"
                fi
            else
                log_warn "No uploads directory found in container at /app/backend/uploads"
            fi
        else
            log_warn "App container '$APP_CONTAINER' is not running. Skipping container uploads."
        fi
    fi

    # Also check local directories (works for both modes)
    local local_dirs=(
        "backend/uploads"
        "../backend/uploads"
        "./uploads"
    )

    for dir in "${local_dirs[@]}"; do
        if [ -d "$dir" ]; then
            cp -r "$dir"/* "$TEMP_DIR/uploads/" 2>/dev/null || true
            uploads_backed_up=1
            log_success "Copied uploads from $dir"
        fi
    done

    if [ $uploads_backed_up -eq 0 ]; then
        log_warn "No upload directories found"
    else
        local upload_count=$(find "$TEMP_DIR/uploads" -type f 2>/dev/null | wc -l | tr -d ' ')
        log_success "Total files backed up: $upload_count"
    fi
}

# Backup data directory (backups, caches, etc.)
backup_data() {
    log_info "Backing up data directory..."

    local data_backed_up=0

    if [ "$MODE" == "docker" ]; then
        # Docker mode: copy from container
        if [ -n "$APP_CONTAINER" ] && docker ps --format '{{.Names}}' | grep -q "^${APP_CONTAINER}$"; then
            if docker exec "$APP_CONTAINER" test -d /app/backend/src/data 2>/dev/null; then
                docker cp "$APP_CONTAINER:/app/backend/src/data/." "$TEMP_DIR/data/"
                data_backed_up=1
                log_success "Copied data from Docker container"
            fi
        fi
    fi

    # Also check local directories
    local data_dirs=(
        "backend/src/data"
        "../backend/src/data"
        "./src/data"
    )

    for dir in "${data_dirs[@]}"; do
        if [ -d "$dir" ]; then
            cp -r "$dir"/* "$TEMP_DIR/data/" 2>/dev/null || true
            data_backed_up=1
            log_success "Copied data from $dir"
        fi
    done

    if [ $data_backed_up -eq 0 ]; then
        log_warn "No data directories found"
    fi
}

# Backup configuration files
backup_config() {
    log_info "Backing up configuration files..."

    local config_files=(
        ".env"
        "backend/.env"
        "../backend/.env"
        ".env.example"
        "backend/.env.example"
        "docker-compose.yaml"
        "docker-compose.yml"
        "../docker-compose.yaml"
        "../docker-compose.yml"
    )

    local configs_backed_up=0

    for file in "${config_files[@]}"; do
        if [ -f "$file" ]; then
            # Sanitize sensitive data from .env files
            local filename=$(basename "$file")
            if [[ "$filename" == ".env" ]]; then
                # Create sanitized version (mask passwords/secrets)
                sed -e 's/\(PASSWORD=\).*/\1***MASKED***/g' \
                    -e 's/\(SECRET=\).*/\1***MASKED***/g' \
                    -e 's/\(API_KEY=\).*/\1***MASKED***/g' \
                    -e 's/\(ENCRYPTION_KEY=\).*/\1***MASKED***/g' \
                    "$file" > "$TEMP_DIR/config/${filename}.sanitized"
                log_info "Sanitized $file (sensitive values masked)"
            else
                cp "$file" "$TEMP_DIR/config/"
            fi
            configs_backed_up=1
        fi
    done

    if [ $configs_backed_up -eq 0 ]; then
        log_warn "No configuration files found"
    fi
}

# Create backup manifest with metadata
create_manifest() {
    log_info "Creating backup manifest..."

    local manifest_file="$TEMP_DIR/manifest.json"

    # Get database record counts if possible
    local user_count="unknown"
    local trade_count="unknown"
    local diary_count="unknown"

    if [ "$MODE" == "docker" ] && [ -n "$DB_CONTAINER" ] && docker ps --format '{{.Names}}' | grep -q "^${DB_CONTAINER}$"; then
        user_count=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ' || echo "unknown")
        trade_count=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM trades;" 2>/dev/null | tr -d ' ' || echo "unknown")
        diary_count=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM diary_entries;" 2>/dev/null | tr -d ' ' || echo "unknown")
    elif [ "$MODE" == "local" ]; then
        if [ -n "$DB_PASSWORD" ]; then
            user_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | tr -d ' ' || echo "unknown")
            trade_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM trades;" 2>/dev/null | tr -d ' ' || echo "unknown")
            diary_count=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM diary_entries;" 2>/dev/null | tr -d ' ' || echo "unknown")
        fi
    fi

    # Count files
    local upload_files=$(find "$TEMP_DIR/uploads" -type f 2>/dev/null | wc -l | tr -d ' ')
    local data_files=$(find "$TEMP_DIR/data" -type f 2>/dev/null | wc -l | tr -d ' ')

    cat > "$manifest_file" << EOF
{
  "backup_version": "1.0",
  "created_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "created_by": "$(whoami)@$(hostname)",
  "backup_mode": "$MODE",
  "tradetally": {
    "database": {
      "name": "$DB_NAME",
      "users": $user_count,
      "trades": $trade_count,
      "diary_entries": $diary_count
    },
    "files": {
      "uploads": $upload_files,
      "data_files": $data_files
    }
  },
  "contents": {
    "database": "database/tradetally.sql",
    "uploads": "uploads/",
    "data": "data/",
    "config": "config/"
  }
}
EOF

    log_success "Manifest created"
}

# Create final archive
create_archive() {
    log_info "Creating backup archive..."

    local archive_file="$BACKUP_DIR/${BACKUP_NAME}.tar.gz"

    # Create tar.gz archive
    tar -czf "$archive_file" -C "$TEMP_DIR" .

    local archive_size=$(du -h "$archive_file" | cut -f1)
    log_success "Archive created: $archive_file ($archive_size)"

    # Generate checksum
    if command -v sha256sum &> /dev/null; then
        sha256sum "$archive_file" > "$archive_file.sha256"
        log_success "Checksum created: $archive_file.sha256"
    elif command -v shasum &> /dev/null; then
        shasum -a 256 "$archive_file" > "$archive_file.sha256"
        log_success "Checksum created: $archive_file.sha256"
    fi

    echo ""
    echo "=========================================="
    echo -e "${GREEN}BACKUP COMPLETE${NC}"
    echo "=========================================="
    echo "Archive: $archive_file"
    echo "Size: $archive_size"
    echo ""
}

# Cleanup temporary files
cleanup() {
    if [ -d "$TEMP_DIR" ]; then
        rm -rf "$TEMP_DIR"
    fi
}

# Main execution
main() {
    echo ""
    echo "=========================================="
    echo "TradeTally Complete Backup"
    echo "=========================================="
    echo ""

    # Set up cleanup trap
    trap cleanup EXIT

    # Detect mode and load config
    load_env
    detect_mode

    log_info "Backup mode: $MODE"
    log_info "Output directory: $BACKUP_DIR"
    log_info "Backup name: $BACKUP_NAME"
    echo ""

    # Run backup steps
    create_backup_dirs
    backup_database
    backup_uploads
    backup_data
    backup_config
    create_manifest
    create_archive

    log_success "Backup completed successfully!"
}

# Run main function
main
