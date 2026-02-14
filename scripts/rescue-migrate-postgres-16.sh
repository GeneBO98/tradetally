#!/bin/bash

# PostgreSQL 15 to 16 Rescue Migration Script for TradeTally
# This handles the case where docker-compose is already set to PG16 but data is PG15

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration - auto-detect compose file
if [[ -f "docker-compose.yaml" ]]; then
    DOCKER_COMPOSE_FILE="docker-compose.yaml"
elif [[ -f "docker-compose.yml" ]]; then
    DOCKER_COMPOSE_FILE="docker-compose.yml"
else
    DOCKER_COMPOSE_FILE="docker-compose.dev.yaml"
fi

# Allow override via environment variable
DOCKER_COMPOSE_FILE="${COMPOSE_FILE:-$DOCKER_COMPOSE_FILE}"

echo -e "${BLUE}[INFO] Using compose file: $DOCKER_COMPOSE_FILE${NC}"
BACKUP_DIR="./postgres-migration-backup"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="tradetally_backup_${TIMESTAMP}.sql"

echo -e "${BLUE}=== TradeTally PostgreSQL 15 to 16 Rescue Migration ===${NC}"
echo -e "${YELLOW}[INFO] This script handles the case where docker-compose is set to PG16 but data is PG15${NC}"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Step 1: Temporarily revert to PostgreSQL 15 to create backup
echo -e "${BLUE}[STEP 1/7] Temporarily reverting to PostgreSQL 15 for backup...${NC}"
cp "$DOCKER_COMPOSE_FILE" "$DOCKER_COMPOSE_FILE.pg16"
sed -i.bak 's/postgres:16-alpine/postgres:15-alpine/g' "$DOCKER_COMPOSE_FILE"

# Step 2: Start PostgreSQL 15 to access the data
echo -e "${BLUE}[STEP 2/7] Starting PostgreSQL 15 to access existing data...${NC}"
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d postgres

# Wait for PostgreSQL 15 to be ready
echo -e "${BLUE}[INFO] Waiting for PostgreSQL 15 to be ready...${NC}"
for i in {1..30}; do
    if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_isready -U trader -d tradetally; then
        echo -e "${GREEN}[SUCCESS] PostgreSQL 15 is ready${NC}"
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo -e "${RED}[ERROR] PostgreSQL 15 failed to start within 30 seconds${NC}"
        exit 1
    fi
    echo -e "${YELLOW}[INFO] Waiting for PostgreSQL... (${i}/30)${NC}"
    sleep 1
done

# Step 3: Create backup
echo -e "${BLUE}[STEP 3/7] Creating backup of current database...${NC}"
docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_dumpall -U trader > "$BACKUP_DIR/$BACKUP_FILE"

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}[SUCCESS] Database backup created: $BACKUP_DIR/$BACKUP_FILE${NC}"
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
    echo -e "${BLUE}[INFO] Backup size: $BACKUP_SIZE${NC}"
else
    echo -e "${RED}[ERROR] Failed to create database backup!${NC}"
    exit 1
fi

# Step 4: Stop PostgreSQL 15
echo -e "${BLUE}[STEP 4/7] Stopping PostgreSQL 15...${NC}"
docker-compose -f "$DOCKER_COMPOSE_FILE" down

# Determine volume name based on compose file
if [[ "$DOCKER_COMPOSE_FILE" == *"dev"* ]]; then
    VOLUME_NAME="tradetally_postgres_data_dev"
else
    VOLUME_NAME="tradetally_postgres_data"
fi

echo -e "${BLUE}[INFO] Using volume: $VOLUME_NAME${NC}"

# Step 5: Backup the volume
echo -e "${BLUE}[STEP 5/7] Backing up PostgreSQL data volume...${NC}"
docker run --rm -v "$VOLUME_NAME":/source -v "$(pwd)/$BACKUP_DIR":/backup alpine tar czf /backup/postgres_volume_backup_${TIMESTAMP}.tar.gz -C /source .

# Step 6: Remove old data and restore PostgreSQL 16 config
echo -e "${BLUE}[STEP 6/7] Removing old data and configuring PostgreSQL 16...${NC}"
docker volume rm "$VOLUME_NAME" || true
cp "$DOCKER_COMPOSE_FILE.pg16" "$DOCKER_COMPOSE_FILE"

# Step 7: Start PostgreSQL 16 and restore data
echo -e "${BLUE}[STEP 7/7] Starting PostgreSQL 16 and restoring data...${NC}"
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d postgres

# Wait for PostgreSQL 16 to be ready
echo -e "${BLUE}[INFO] Waiting for PostgreSQL 16 to be ready...${NC}"
for i in {1..30}; do
    if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_isready -U trader -d tradetally; then
        echo -e "${GREEN}[SUCCESS] PostgreSQL 16 is ready${NC}"
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo -e "${RED}[ERROR] PostgreSQL 16 failed to start within 30 seconds${NC}"
        exit 1
    fi
    echo -e "${YELLOW}[INFO] Waiting for PostgreSQL... (${i}/30)${NC}"
    sleep 1
done

# Restore the database
echo -e "${BLUE}[INFO] Restoring database from backup...${NC}"
docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres psql -U trader -d postgres < "$BACKUP_DIR/$BACKUP_FILE"

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}[SUCCESS] Database restored successfully${NC}"
else
    echo -e "${RED}[ERROR] Failed to restore database!${NC}"
    exit 1
fi

# Start all services
echo -e "${BLUE}[INFO] Starting all services...${NC}"
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d

# Verify the migration
echo -e "${BLUE}[INFO] Verifying migration...${NC}"
sleep 5

# Check PostgreSQL version
PG_VERSION=$(docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres psql -U trader -d tradetally -t -c "SELECT version();" | head -1 | xargs)
echo -e "${BLUE}[INFO] Current PostgreSQL version: $PG_VERSION${NC}"

# Check data integrity
TRADE_COUNT=$(docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres psql -U trader -d tradetally -t -c "SELECT COUNT(*) FROM trades;" 2>/dev/null | xargs || echo "0")
echo -e "${BLUE}[INFO] Trade count in database: $TRADE_COUNT${NC}"

# Clean up temporary files
rm -f "$DOCKER_COMPOSE_FILE.bak" "$DOCKER_COMPOSE_FILE.pg16"

echo ""
echo -e "${GREEN}=== RESCUE MIGRATION COMPLETED SUCCESSFULLY ===${NC}"
echo -e "${GREEN}[SUCCESS] PostgreSQL has been upgraded from 15 to 16${NC}"
echo -e "${BLUE}[INFO] Backups saved in: $BACKUP_DIR/${NC}"
echo ""
echo -e "${YELLOW}[RECOMMENDATION] Test your application thoroughly${NC}"
echo -e "${GREEN}[COMPLETE] Migration process finished!${NC}"