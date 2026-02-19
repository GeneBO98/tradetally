#!/bin/bash

# PostgreSQL 16 to 15 Rollback Script for TradeTally
# This script rolls back from PostgreSQL 16 to 15 using backups

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

echo -e "${BLUE}=== TradeTally PostgreSQL 16 to 15 Rollback ===${NC}"
echo -e "${YELLOW}[WARNING] This will roll back your database to PostgreSQL 15${NC}"
echo -e "${YELLOW}[WARNING] Any data changes since migration will be lost${NC}"
echo ""

# Check if backup directory exists
if [[ ! -d "$BACKUP_DIR" ]]; then
    echo -e "${RED}[ERROR] Backup directory not found: $BACKUP_DIR${NC}"
    echo -e "${RED}[ERROR] Cannot perform rollback without backups${NC}"
    exit 1
fi

# List available backups
echo -e "${BLUE}[INFO] Available backups:${NC}"
ls -la "$BACKUP_DIR"

# Find the most recent SQL backup
SQL_BACKUP=$(ls -t "$BACKUP_DIR"/tradetally_backup_*.sql 2>/dev/null | head -1)
VOLUME_BACKUP=$(ls -t "$BACKUP_DIR"/postgres_volume_backup_*.tar.gz 2>/dev/null | head -1)

if [[ -z "$SQL_BACKUP" ]]; then
    echo -e "${RED}[ERROR] No SQL backup found in $BACKUP_DIR${NC}"
    exit 1
fi

if [[ -z "$VOLUME_BACKUP" ]]; then
    echo -e "${RED}[ERROR] No volume backup found in $BACKUP_DIR${NC}"
    exit 1
fi

echo -e "${BLUE}[INFO] Using SQL backup: $(basename "$SQL_BACKUP")${NC}"
echo -e "${BLUE}[INFO] Using volume backup: $(basename "$VOLUME_BACKUP")${NC}"

# Prompt for confirmation
read -p "Do you want to continue with the rollback? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}[CANCELLED] Rollback cancelled by user.${NC}"
    exit 0
fi

echo -e "${BLUE}[INFO] Starting PostgreSQL rollback process...${NC}"

# Step 1: Stop current containers
echo -e "${BLUE}[STEP 1/5] Stopping current containers...${NC}"
docker-compose -f "$DOCKER_COMPOSE_FILE" down

# Determine volume name based on compose file
if [[ "$DOCKER_COMPOSE_FILE" == *"dev"* ]]; then
    VOLUME_NAME="tradetally_postgres_data_dev"
else
    VOLUME_NAME="tradetally_postgres_data"
fi

echo -e "${BLUE}[INFO] Using volume: $VOLUME_NAME${NC}"

# Step 2: Remove PostgreSQL 16 data volume
echo -e "${BLUE}[STEP 2/5] Removing PostgreSQL 16 data volume...${NC}"
docker volume rm "$VOLUME_NAME" || true

# Step 3: Restore PostgreSQL 15 volume backup
echo -e "${BLUE}[STEP 3/5] Restoring PostgreSQL 15 volume...${NC}"
docker run --rm -v "$VOLUME_NAME":/target -v "$(pwd)/$BACKUP_DIR":/backup alpine tar xzf "/backup/$(basename "$VOLUME_BACKUP")" -C /target

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}[SUCCESS] PostgreSQL 15 volume restored${NC}"
else
    echo -e "${RED}[ERROR] Failed to restore PostgreSQL 15 volume!${NC}"
    exit 1
fi

# Step 4: Update docker-compose to use PostgreSQL 15
echo -e "${BLUE}[STEP 4/5] Updating docker-compose to use PostgreSQL 15...${NC}"
sed -i.bak 's/postgres:16-alpine/postgres:15-alpine/g' "$DOCKER_COMPOSE_FILE"

# Step 5: Start PostgreSQL 15
echo -e "${BLUE}[STEP 5/5] Starting PostgreSQL 15...${NC}"
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d

# Wait for PostgreSQL to be ready
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

# Verify the rollback
echo -e "${BLUE}[INFO] Verifying rollback...${NC}"
sleep 5

# Check PostgreSQL version
PG_VERSION=$(docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres psql -U trader -d tradetally -t -c "SELECT version();" | head -1 | xargs)
echo -e "${BLUE}[INFO] Current PostgreSQL version: $PG_VERSION${NC}"

# Check if we can connect and query data
TRADE_COUNT=$(docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres psql -U trader -d tradetally -t -c "SELECT COUNT(*) FROM trades;" 2>/dev/null | xargs || echo "0")
echo -e "${BLUE}[INFO] Trade count in database: $TRADE_COUNT${NC}"

# Clean up backup file from docker-compose
rm -f "$DOCKER_COMPOSE_FILE.bak"

echo ""
echo -e "${GREEN}=== ROLLBACK COMPLETED SUCCESSFULLY ===${NC}"
echo -e "${GREEN}[SUCCESS] PostgreSQL has been rolled back to version 15${NC}"
echo -e "${BLUE}[INFO] Your data has been restored from the backup${NC}"
echo -e "${YELLOW}[INFO] Backup files are still available in: $BACKUP_DIR${NC}"
echo ""
echo -e "${GREEN}[COMPLETE] Rollback process finished!${NC}"