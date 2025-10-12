#!/bin/bash

# TradeTally Docker to Native Migration Script
# This script automates the migration from Docker to native services

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
MIGRATION_DIR="$HOME/tradetally-migration"
APP_DIR="/opt/tradetally"
BACKUP_DATE=$(date +%Y%m%d_%H%M%S)

echo -e "${GREEN}TradeTally Migration Script - Docker to Native${NC}"
echo "================================================"

# Function to check command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to print status
print_status() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Step 1: Pre-flight checks
echo -e "\n${YELLOW}Step 1: Pre-flight checks${NC}"

if ! command_exists docker; then
    print_error "Docker is not installed or not in PATH"
    exit 1
fi

if ! docker ps | grep -q tradetally; then
    print_warning "TradeTally containers are not running. Starting them..."
    docker-compose -f docker-compose.dev.yaml up -d
    sleep 10
fi

# Step 2: Create migration directory
echo -e "\n${YELLOW}Step 2: Creating migration directory${NC}"
mkdir -p "$MIGRATION_DIR"
print_status "Migration directory created at $MIGRATION_DIR"

# Step 3: Export PostgreSQL database
echo -e "\n${YELLOW}Step 3: Exporting PostgreSQL database${NC}"

echo "Exporting database..."
docker exec tradetally-db-dev pg_dump -U trader -d tradetally > "$MIGRATION_DIR/tradetally_backup_$BACKUP_DATE.sql" 2>/dev/null || \
docker exec tradetally-postgres-1 pg_dump -U trader -d tradetally > "$MIGRATION_DIR/tradetally_backup_$BACKUP_DATE.sql" 2>/dev/null || \
docker exec tradetally-db pg_dump -U trader -d tradetally > "$MIGRATION_DIR/tradetally_backup_$BACKUP_DATE.sql"

if [ -f "$MIGRATION_DIR/tradetally_backup_$BACKUP_DATE.sql" ]; then
    print_status "Database exported successfully"
    echo "Backup size: $(du -h "$MIGRATION_DIR/tradetally_backup_$BACKUP_DATE.sql" | cut -f1)"
else
    print_error "Database export failed"
    exit 1
fi

# Step 4: Export application data
echo -e "\n${YELLOW}Step 4: Exporting application data${NC}"

# Try different container names
CONTAINER_NAME=""
for name in tradetally-app-dev tradetally-app; do
    if docker ps | grep -q $name; then
        CONTAINER_NAME=$name
        break
    fi
done

if [ -z "$CONTAINER_NAME" ]; then
    print_error "Could not find running app container"
    exit 1
fi

docker cp $CONTAINER_NAME:/app/backend/src/data "$MIGRATION_DIR/app_data" 2>/dev/null || print_warning "No data directory to copy"
docker cp $CONTAINER_NAME:/app/backend/src/logs "$MIGRATION_DIR/app_logs" 2>/dev/null || print_warning "No logs directory to copy"
print_status "Application data exported"

# Step 5: Copy environment configuration
echo -e "\n${YELLOW}Step 5: Saving environment configuration${NC}"
if [ -f .env ]; then
    cp .env "$MIGRATION_DIR/.env.backup"
    print_status "Environment configuration saved"
else
    print_warning "No .env file found in current directory"
fi

# Step 6: Check for required services
echo -e "\n${YELLOW}Step 6: Checking required services${NC}"

MISSING_SERVICES=()

if ! command_exists psql; then
    MISSING_SERVICES+=("postgresql")
fi

if ! command_exists node; then
    MISSING_SERVICES+=("nodejs")
fi

if ! command_exists nginx; then
    MISSING_SERVICES+=("nginx")
fi

if ! command_exists pm2; then
    MISSING_SERVICES+=("pm2")
fi

if [ ${#MISSING_SERVICES[@]} -gt 0 ]; then
    echo -e "${YELLOW}The following services need to be installed:${NC}"
    printf '%s\n' "${MISSING_SERVICES[@]}"

    read -p "Would you like to install them now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        # Install missing services
        if [[ " ${MISSING_SERVICES[@]} " =~ " postgresql " ]]; then
            echo "Installing PostgreSQL..."
            sudo apt-get update
            sudo apt-get install -y postgresql postgresql-contrib
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
        fi

        if [[ " ${MISSING_SERVICES[@]} " =~ " nodejs " ]]; then
            echo "Installing Node.js..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        fi

        if [[ " ${MISSING_SERVICES[@]} " =~ " nginx " ]]; then
            echo "Installing Nginx..."
            sudo apt-get install -y nginx
            sudo systemctl enable nginx
        fi

        if [[ " ${MISSING_SERVICES[@]} " =~ " pm2 " ]]; then
            echo "Installing PM2..."
            sudo npm install -g pm2
        fi
    else
        print_error "Required services are not installed. Please install them manually and run this script again."
        exit 1
    fi
fi

print_status "All required services are available"

# Step 7: Set up PostgreSQL
echo -e "\n${YELLOW}Step 7: Setting up PostgreSQL${NC}"

echo "Creating database and user..."
sudo -u postgres psql <<EOF
CREATE USER trader WITH PASSWORD 'trader_password';
CREATE DATABASE tradetally OWNER trader;
GRANT ALL PRIVILEGES ON DATABASE tradetally TO trader;
EOF

print_status "Database and user created"

# Import the database
echo "Importing database backup..."
sudo -u postgres psql tradetally < "$MIGRATION_DIR/tradetally_backup_$BACKUP_DATE.sql"
sudo -u postgres psql -c "ALTER DATABASE tradetally OWNER TO trader;"
print_status "Database imported successfully"

# Step 8: Set up application directory
echo -e "\n${YELLOW}Step 8: Setting up application directory${NC}"

# Create app directory
sudo mkdir -p "$APP_DIR"
sudo chown $USER:$USER "$APP_DIR"

# Copy application code
echo "Copying application code..."
cp -r . "$APP_DIR/"

# Restore data directories if they exist
if [ -d "$MIGRATION_DIR/app_data" ]; then
    cp -r "$MIGRATION_DIR/app_data" "$APP_DIR/backend/src/"
    print_status "Data directory restored"
fi

if [ -d "$MIGRATION_DIR/app_logs" ]; then
    cp -r "$MIGRATION_DIR/app_logs" "$APP_DIR/backend/src/"
    print_status "Logs directory restored"
fi

# Step 9: Install dependencies
echo -e "\n${YELLOW}Step 9: Installing dependencies${NC}"

cd "$APP_DIR/backend"
npm install --production
print_status "Backend dependencies installed"

cd "$APP_DIR/frontend"
npm install
npm run build
print_status "Frontend built successfully"

# Step 10: Configure environment
echo -e "\n${YELLOW}Step 10: Configuring environment${NC}"

if [ -f "$MIGRATION_DIR/.env.backup" ]; then
    cp "$MIGRATION_DIR/.env.backup" "$APP_DIR/backend/.env"
    # Update database host for native setup
    sed -i 's/DB_HOST=postgres/DB_HOST=localhost/g' "$APP_DIR/backend/.env"
    sed -i 's/DB_HOST=tradetally-db/DB_HOST=localhost/g' "$APP_DIR/backend/.env"
    print_status "Environment configured"
else
    print_warning "No backup .env found. Please configure manually at $APP_DIR/backend/.env"
fi

# Step 11: Run migrations
echo -e "\n${YELLOW}Step 11: Running database migrations${NC}"
cd "$APP_DIR/backend"
npm run migrate || print_warning "Migrations may have already been applied"

# Step 12: Set up PM2
echo -e "\n${YELLOW}Step 12: Setting up PM2${NC}"

cat > "$APP_DIR/ecosystem.config.js" <<'EOF'
module.exports = {
  apps: [{
    name: 'tradetally-backend',
    script: './src/server.js',
    cwd: '/opt/tradetally/backend',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './src/logs/pm2-error.log',
    out_file: './src/logs/pm2-out.log',
    log_file: './src/logs/pm2-combined.log',
    time: true,
    watch: false,
    max_memory_restart: '1G'
  }]
};
EOF

cd "$APP_DIR"
pm2 start ecosystem.config.js
pm2 save
print_status "PM2 configured and started"

# Step 13: Configure Nginx
echo -e "\n${YELLOW}Step 13: Configuring Nginx${NC}"

sudo tee /etc/nginx/sites-available/tradetally > /dev/null <<'EOF'
server {
    listen 80;
    server_name localhost;

    root /opt/tradetally/frontend/dist;
    index index.html;

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 52M;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/tradetally /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
print_status "Nginx configured"

# Step 14: Set proper permissions
echo -e "\n${YELLOW}Step 14: Setting permissions${NC}"
sudo chown -R www-data:www-data "$APP_DIR/backend/src/data" 2>/dev/null || true
sudo chown -R www-data:www-data "$APP_DIR/backend/src/logs" 2>/dev/null || true
print_status "Permissions set"

# Step 15: Verification
echo -e "\n${YELLOW}Step 15: Verifying installation${NC}"

# Check if backend is running
sleep 5
if curl -s http://localhost:3000/api/health > /dev/null; then
    print_status "Backend is running"
else
    print_error "Backend health check failed"
fi

# Check if frontend is accessible
if curl -s http://localhost > /dev/null; then
    print_status "Frontend is accessible"
else
    print_error "Frontend is not accessible"
fi

# Final summary
echo -e "\n${GREEN}=== Migration Complete ===${NC}"
echo "TradeTally has been migrated to native services!"
echo ""
echo "Access your application at: http://localhost"
echo ""
echo "Useful commands:"
echo "  View logs:        pm2 logs tradetally-backend"
echo "  Monitor:          pm2 monit"
echo "  Restart backend:  pm2 restart tradetally-backend"
echo "  Stop backend:     pm2 stop tradetally-backend"
echo ""
echo "Backup location: $MIGRATION_DIR"
echo ""
echo -e "${YELLOW}Note: Your Docker containers are still running.${NC}"
echo "Once you've verified everything works, you can stop them with:"
echo "  docker-compose -f docker-compose.dev.yaml down"
echo ""
echo "To remove Docker volumes (ONLY after confirming data is migrated!):"
echo "  docker volume rm tradetally_postgres_data_dev"