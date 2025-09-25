#!/bin/bash

# PostgreSQL 15 to 16 Migration Script for TradeTally
# This script safely migrates your PostgreSQL data from version 15 to 16

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOCKER_COMPOSE_FILE="docker-compose.dev.yaml"
BACKUP_DIR="./postgres-migration-backup"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="tradetally_backup_${TIMESTAMP}.sql"

echo -e "${BLUE}=== TradeTally PostgreSQL 15 to 16 Migration ===${NC}"
echo -e "${YELLOW}[WARNING] This will temporarily stop your application and migrate your database.${NC}"
echo -e "${YELLOW}[WARNING] Make sure you have sufficient disk space for the backup.${NC}"
echo ""

# Check if docker-compose file exists
if [[ ! -f "$DOCKER_COMPOSE_FILE" ]]; then
    echo -e "${RED}[ERROR] $DOCKER_COMPOSE_FILE not found!${NC}"
    exit 1
fi

# Prompt for confirmation
read -p "Do you want to continue with the migration? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}[CANCELLED] Migration cancelled by user.${NC}"
    exit 0
fi

echo -e "${BLUE}[INFO] Starting PostgreSQL migration process...${NC}"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Step 1: Create a full backup of the current database
echo -e "${BLUE}[STEP 1/6] Creating backup of current database...${NC}"
docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_dumpall -U trader > "$BACKUP_DIR/$BACKUP_FILE"

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}[SUCCESS] Database backup created: $BACKUP_DIR/$BACKUP_FILE${NC}"
    
    # Show backup size
    BACKUP_SIZE=$(du -h "$BACKUP_DIR/$BACKUP_FILE" | cut -f1)
    echo -e "${BLUE}[INFO] Backup size: $BACKUP_SIZE${NC}"
else
    echo -e "${RED}[ERROR] Failed to create database backup!${NC}"
    exit 1
fi

# Step 2: Stop the current containers
echo -e "${BLUE}[STEP 2/6] Stopping current containers...${NC}"
docker-compose -f "$DOCKER_COMPOSE_FILE" down

# Step 3: Backup the PostgreSQL data volume
echo -e "${BLUE}[STEP 3/6] Backing up PostgreSQL data volume...${NC}"
docker run --rm -v tradetally_postgres_data_dev:/source -v "$(pwd)/$BACKUP_DIR":/backup alpine tar czf /backup/postgres_volume_backup_${TIMESTAMP}.tar.gz -C /source .

if [[ $? -eq 0 ]]; then
    echo -e "${GREEN}[SUCCESS] PostgreSQL volume backed up${NC}"
else
    echo -e "${RED}[ERROR] Failed to backup PostgreSQL volume!${NC}"
    exit 1
fi

# Step 4: Remove the old PostgreSQL data volume
echo -e "${BLUE}[STEP 4/6] Removing old PostgreSQL data volume...${NC}"
docker volume rm tradetally_postgres_data_dev || true

# Step 5: Update docker-compose to use PostgreSQL 16
echo -e "${BLUE}[STEP 5/6] Updating docker-compose to use PostgreSQL 16...${NC}"
sed -i.bak 's/postgres:15-alpine/postgres:16-alpine/g' "$DOCKER_COMPOSE_FILE"

# Step 6: Start PostgreSQL 16 and restore data
echo -e "${BLUE}[STEP 6/6] Starting PostgreSQL 16 and restoring data...${NC}"

# Start only PostgreSQL first
echo -e "${BLUE}[INFO] Starting PostgreSQL 16 container...${NC}"
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d postgres

# Wait for PostgreSQL to be ready
echo -e "${BLUE}[INFO] Waiting for PostgreSQL 16 to be ready...${NC}"
for i in {1..30}; do
    if docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres pg_isready -U trader -d tradetally; then
        echo -e "${GREEN}[SUCCESS] PostgreSQL 16 is ready${NC}"
        break
    fi
    if [[ $i -eq 30 ]]; then
        echo -e "${RED}[ERROR] PostgreSQL 16 failed to start within 30 seconds${NC}"
        echo -e "${YELLOW}[ROLLBACK] Restoring original configuration...${NC}"
        mv "$DOCKER_COMPOSE_FILE.bak" "$DOCKER_COMPOSE_FILE"
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
    echo -e "${YELLOW}[INFO] You can manually restore using: ${NC}"
    echo -e "${YELLOW}docker-compose -f $DOCKER_COMPOSE_FILE exec -T postgres psql -U trader -d postgres < $BACKUP_DIR/$BACKUP_FILE${NC}"
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

# Check if we can connect and query data
TRADE_COUNT=$(docker-compose -f "$DOCKER_COMPOSE_FILE" exec -T postgres psql -U trader -d tradetally -t -c "SELECT COUNT(*) FROM trades;" 2>/dev/null | xargs || echo "0")
echo -e "${BLUE}[INFO] Trade count in database: $TRADE_COUNT${NC}"

# Clean up backup file from docker-compose
rm -f "$DOCKER_COMPOSE_FILE.bak"

echo ""
echo -e "${GREEN}=== MIGRATION COMPLETED SUCCESSFULLY ===${NC}"
echo -e "${GREEN}[SUCCESS] PostgreSQL has been upgraded from 15 to 16${NC}"
echo -e "${BLUE}[INFO] Backups saved in: $BACKUP_DIR/${NC}"
echo -e "${BLUE}[INFO] - SQL backup: $BACKUP_FILE${NC}"
echo -e "${BLUE}[INFO] - Volume backup: postgres_volume_backup_${TIMESTAMP}.tar.gz${NC}"
echo ""
echo -e "${YELLOW}[RECOMMENDATION] Keep these backups until you're confident the migration was successful${NC}"
echo -e "${YELLOW}[RECOMMENDATION] Test your application thoroughly before deleting the backups${NC}"

# Optional cleanup prompt
echo ""
read -p "Do you want to clean up the backup files now? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$BACKUP_DIR"
    echo -e "${GREEN}[INFO] Backup files cleaned up${NC}"
else
    echo -e "${BLUE}[INFO] Backup files kept in: $BACKUP_DIR${NC}"
fi

echo -e "${GREEN}[COMPLETE] Migration process finished!${NC}"