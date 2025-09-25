#!/bin/bash

# Migration script for existing TradeTally deployments
# This script can be run on existing Docker deployments to add mobile support

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}[MIGRATE] TradeTally Mobile Support Migration${NC}"
echo -e "${BLUE}======================================${NC}"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}[ERROR] Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Function to check if container exists and is running
check_container() {
    local container_name=$1
    if docker ps -q -f name="$container_name" | grep -q .; then
        return 0
    else
        return 1
    fi
}

# Check for existing TradeTally containers
echo -e "${YELLOW}[INFO] Checking for existing TradeTally containers...${NC}"

DB_CONTAINER=""
APP_CONTAINER=""

# Common container names to check
POSSIBLE_DB_NAMES=("tradetally-db" "tradetally_postgres_1" "tradetally_db_1" "postgres")
POSSIBLE_APP_NAMES=("tradetally-app" "tradetally_app_1" "tradetally-backend")

for name in "${POSSIBLE_DB_NAMES[@]}"; do
    if check_container "$name"; then
        DB_CONTAINER="$name"
        echo -e "${GREEN}[OK] Found database container: $name${NC}"
        break
    fi
done

for name in "${POSSIBLE_APP_NAMES[@]}"; do
    if check_container "$name"; then
        APP_CONTAINER="$name"
        echo -e "${GREEN}[OK] Found app container: $name${NC}"
        break
    fi
done

if [[ -z "$DB_CONTAINER" ]]; then
    echo -e "${RED}[ERROR] No TradeTally database container found.${NC}"
    echo -e "${YELLOW}   Please make sure your TradeTally instance is running.${NC}"
    echo -e "${YELLOW}   Looking for containers with these names: ${POSSIBLE_DB_NAMES[*]}${NC}"
    exit 1
fi

# Backup database
echo ""
echo -e "${YELLOW}[BACKUP] Creating database backup...${NC}"
BACKUP_FILE="tradetally_backup_$(date +%Y%m%d_%H%M%S).sql"
docker exec "$DB_CONTAINER" pg_dump -U trader -d tradetally > "$BACKUP_FILE"
echo -e "${GREEN}[OK] Database backup created: $BACKUP_FILE${NC}"

# Method 1: Use existing app container to run migrations
if [[ -n "$APP_CONTAINER" ]]; then
    echo ""
    echo -e "${YELLOW}[MIGRATE] Running migrations using existing app container...${NC}"
    
    # Copy migration files to the container
    echo -e "${BLUE}   Copying migration files...${NC}"
    docker cp "$PROJECT_ROOT/backend/src/utils/migrate.js" "$APP_CONTAINER:/app/backend/src/utils/"
    docker cp "$PROJECT_ROOT/backend/migrations/" "$APP_CONTAINER:/app/backend/"
    
    # Run migrations
    echo -e "${BLUE}   Executing migrations...${NC}"
    docker exec "$APP_CONTAINER" node /app/backend/src/utils/migrate.js
    
    echo -e "${GREEN}[OK] Migrations completed using existing container${NC}"
    
# Method 2: Use direct database connection
else
    echo ""
    echo -e "${YELLOW}[MIGRATE] Running migrations directly on database...${NC}"
    
    # Run migrations directly
    for migration_file in "$PROJECT_ROOT/backend/migrations"/*.sql; do
        if [[ -f "$migration_file" ]]; then
            filename=$(basename "$migration_file")
            echo -e "${BLUE}   Running migration: $filename${NC}"
            
            # Check if migration was already applied (basic check)
            if docker exec "$DB_CONTAINER" psql -U trader -d tradetally -c "SELECT 1 FROM information_schema.tables WHERE table_name = 'migrations'" | grep -q "1 row"; then
                # Migrations table exists, check if this migration was applied
                if docker exec "$DB_CONTAINER" psql -U trader -d tradetally -c "SELECT 1 FROM migrations WHERE filename = '$filename'" | grep -q "1 row"; then
                    echo -e "${YELLOW}     Skipping $filename (already applied)${NC}"
                    continue
                fi
            fi
            
            # Run the migration
            docker exec -i "$DB_CONTAINER" psql -U trader -d tradetally < "$migration_file"
            echo -e "${GREEN}     [OK] $filename applied${NC}"
        fi
    done
fi

# Update Docker Compose with new environment variables
echo ""
echo -e "${YELLOW}[CONFIG] Updating Docker configuration...${NC}"

if [[ -f "$PROJECT_ROOT/docker-compose.yaml" ]]; then
    echo -e "${BLUE}   Adding mobile support environment variables...${NC}"
    
    # Check if mobile env vars already exist
    if ! grep -q "ACCESS_TOKEN_EXPIRE" "$PROJECT_ROOT/docker-compose.yaml"; then
        # Add mobile support environment variables
        cat >> "$PROJECT_ROOT/docker-compose.yaml" << 'EOF'
      # Mobile Support Configuration
      RUN_MIGRATIONS: ${RUN_MIGRATIONS:-true}
      ACCESS_TOKEN_EXPIRE: ${ACCESS_TOKEN_EXPIRE:-15m}
      REFRESH_TOKEN_EXPIRE: ${REFRESH_TOKEN_EXPIRE:-30d}
EOF
    fi
    
    echo -e "${GREEN}   [OK] Docker configuration updated${NC}"
fi

# Create .env template for mobile support
echo ""
echo -e "${YELLOW}[CONFIG] Creating mobile support configuration template...${NC}"

cat > "$PROJECT_ROOT/.env.mobile" << 'EOF'
# Mobile Support Configuration
# Copy these variables to your main .env file

# Instance configuration
INSTANCE_NAME=TradeTally
INSTANCE_URL=https://your-domain.com

# Mobile authentication
ACCESS_TOKEN_EXPIRE=15m
REFRESH_TOKEN_EXPIRE=30d

# Migration control
RUN_MIGRATIONS=true

# CORS origins (comma-separated for multiple mobile apps)
CORS_ORIGINS=http://localhost:5173,https://your-domain.com

# Feature flags
ENABLE_MOBILE_SYNC=true
ENABLE_PUSH_NOTIFICATIONS=false
ENABLE_DEVICE_TRACKING=true
MAX_DEVICES_PER_USER=10

# API Configuration
API_VERSION=v1
EOF

echo -e "${GREEN}[OK] Mobile configuration template created: .env.mobile${NC}"

# Restart containers if needed
if [[ -n "$APP_CONTAINER" ]]; then
    echo ""
    echo -e "${YELLOW}[RESTART] Restarting application container to apply changes...${NC}"
    docker restart "$APP_CONTAINER"
    echo -e "${GREEN}[OK] Application container restarted${NC}"
fi

# Final instructions
echo ""
echo -e "${GREEN}[SUCCESS] Migration completed successfully!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "${YELLOW}1. Review and copy variables from .env.mobile to your main .env file${NC}"
echo -e "${YELLOW}2. Update your domain/URL settings for mobile app discovery${NC}"
echo -e "${YELLOW}3. Test the new mobile API endpoints at /api/v1/server/info${NC}"
echo -e "${YELLOW}4. Your database backup is saved as: $BACKUP_FILE${NC}"
echo ""
echo -e "${BLUE}Mobile API endpoints are now available:${NC}"
echo -e "${YELLOW}  GET /api/v1/server/info - Server discovery${NC}"
echo -e "${YELLOW}  POST /api/v1/auth/refresh - Refresh tokens${NC}"
echo -e "${YELLOW}  GET /api/v1/devices - Device management${NC}"
echo -e "${YELLOW}  POST /api/v1/sync/full - Full sync${NC}"
echo ""
echo -e "${GREEN}Your TradeTally instance is now ready for mobile app support!${NC}"