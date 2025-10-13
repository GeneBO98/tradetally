#!/bin/bash

################################################################################
# TradeTally Docker to Native Migration Script
#
# This script migrates TradeTally from Docker to native systemd services
# Target directory: /home/docker-admin/tradetally
#
# Prerequisites:
# - Ubuntu/Debian system with systemd
# - Docker instance currently running
# - Root/sudo access
# - Node.js 18+ and npm installed
# - PostgreSQL 15+ installed
# - Existing .env file in /home/docker-admin/tradetally
#
# Usage: sudo bash migrate-to-native.sh
################################################################################

set -e  # Exit on error
set -u  # Exit on undefined variable

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/home/docker-admin/tradetally"
APP_USER="docker-admin"
DB_NAME="tradetally"
DB_USER="trader"
DB_HOST="localhost"
DB_PORT="5432"
BACKEND_PORT="3000"
NGINX_SITE_NAME="tradetally"

# Backup directory
BACKUP_DIR="/home/docker-admin/tradetally-backup-$(date +%Y%m%d_%H%M%S)"

################################################################################
# Helper Functions
################################################################################

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root or with sudo"
        exit 1
    fi
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check if running on systemd
    if ! command -v systemctl &> /dev/null; then
        log_error "systemd not found. This script requires a systemd-based system."
        exit 1
    fi

    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found. Cannot migrate from Docker instance."
        exit 1
    fi

    # Check if Node.js is installed
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found. Please install Node.js 18+ first."
        log_info "Install with: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt-get install -y nodejs"
        exit 1
    fi

    # Check Node.js version
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js version 18 or higher required. Current version: $(node -v)"
        exit 1
    fi

    # Check if PostgreSQL is installed
    if ! command -v psql &> /dev/null; then
        log_error "PostgreSQL not found. Please install PostgreSQL 15+ first."
        log_info "Install with: sudo apt-get install -y postgresql postgresql-contrib"
        exit 1
    fi

    # Check if Nginx is installed
    if ! command -v nginx &> /dev/null; then
        log_error "Nginx not found. Please install Nginx first."
        log_info "Install with: sudo apt-get install -y nginx"
        exit 1
    fi

    # Check if app user exists
    if ! id "$APP_USER" &> /dev/null; then
        log_error "User $APP_USER not found. Please create the user first."
        exit 1
    fi

    # Check if .env file exists
    if [ ! -f "$APP_DIR/.env" ]; then
        log_error ".env file not found at $APP_DIR/.env"
        log_info "Please create the .env file before running this script"
        exit 1
    fi

    log_success "All prerequisites met"
}

prompt_confirmation() {
    echo ""
    log_warning "This script will:"
    echo "  1. Export database from Docker PostgreSQL container"
    echo "  2. Create native PostgreSQL database and user"
    echo "  3. Import database to native PostgreSQL"
    echo "  4. Install dependencies (backend and frontend)"
    echo "  5. Build frontend"
    echo "  6. Create PM2 ecosystem configuration"
    echo "  7. Create systemd service"
    echo "  8. Configure Nginx (HTTP only, SSL via Certbot separately)"
    echo "  9. Start services"
    echo " 10. Optionally stop Docker containers"
    echo ""
    log_warning "Backup will be created at: $BACKUP_DIR"
    log_info "Using existing .env file at: $APP_DIR/.env"
    echo ""
    read -p "Do you want to continue? (yes/no): " -r
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        log_info "Migration cancelled"
        exit 0
    fi
}

create_backup_dir() {
    log_info "Creating backup directory..."
    mkdir -p "$BACKUP_DIR"
    
    # Backup existing .env file
    if [ -f "$APP_DIR/.env" ]; then
        cp "$APP_DIR/.env" "$BACKUP_DIR/.env.backup"
        log_info "Backed up .env file"
    fi
    
    log_success "Backup directory created: $BACKUP_DIR"
}

################################################################################
# Database Migration
################################################################################

export_docker_database() {
    log_info "Exporting database from Docker container..."

    # Find the PostgreSQL container
    POSTGRES_CONTAINER=$(docker ps --filter "ancestor=postgres" --format "{{.Names}}" | head -n 1)

    if [ -z "$POSTGRES_CONTAINER" ]; then
        # Try alternative method
        POSTGRES_CONTAINER=$(docker ps --filter "name=postgres" --format "{{.Names}}" | head -n 1)
    fi

    if [ -z "$POSTGRES_CONTAINER" ]; then
        # Try tradetally-postgres
        POSTGRES_CONTAINER=$(docker ps --format "{{.Names}}" | grep postgres | head -n 1)
    fi

    if [ -z "$POSTGRES_CONTAINER" ]; then
        log_error "PostgreSQL container not found. Please ensure Docker containers are running."
        log_info "Running containers:"
        docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
        exit 1
    fi

    log_info "Found PostgreSQL container: $POSTGRES_CONTAINER"

    # Export database
    docker exec "$POSTGRES_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_DIR/database_export.sql"

    if [ ! -s "$BACKUP_DIR/database_export.sql" ]; then
        log_error "Database export failed or is empty"
        exit 1
    fi

    log_success "Database exported to $BACKUP_DIR/database_export.sql"
}

create_native_database() {
    log_info "Creating native PostgreSQL database and user..."

    # Read database password from .env file
    if [ -f "$APP_DIR/.env" ]; then
        DB_PASSWORD=$(grep "^DB_PASSWORD=" "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")
        
        if [ -z "$DB_PASSWORD" ]; then
            log_error "DB_PASSWORD not found in .env file"
            exit 1
        fi
        
        log_info "Using DB_PASSWORD from .env file"
    else
        log_error ".env file not found at $APP_DIR/.env"
        exit 1
    fi

    # Store password for later use
    export DB_PASSWORD

    # Create user and database
    sudo -u postgres psql <<EOF
-- Drop database if exists (careful!)
DROP DATABASE IF EXISTS $DB_NAME;
DROP USER IF EXISTS $DB_USER;

-- Create user
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';

-- Create database
CREATE DATABASE $DB_NAME OWNER $DB_USER;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

    log_success "Database and user created"
}

import_database() {
    log_info "Importing database to native PostgreSQL..."

    # Import the database
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" < "$BACKUP_DIR/database_export.sql"

    log_success "Database imported successfully"
}

################################################################################
# Application Setup
################################################################################

setup_env_files() {
    log_info "Setting up .env files..."

    # Copy main .env to backend
    if [ -f "$APP_DIR/.env" ]; then
        cp "$APP_DIR/.env" "$APP_DIR/backend/.env"
        chown "$APP_USER:$APP_USER" "$APP_DIR/backend/.env"
        chmod 600 "$APP_DIR/backend/.env"
        log_success "Copied .env to backend directory"
    fi

    # Extract VITE_API_URL from main .env or use default
    VITE_API_URL=$(grep "^VITE_API_URL=" "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")
    
    if [ -z "$VITE_API_URL" ]; then
        # Try to get domain from FRONTEND_URL
        FRONTEND_URL=$(grep "^FRONTEND_URL=" "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")
        if [ -n "$FRONTEND_URL" ]; then
            VITE_API_URL="${FRONTEND_URL}/api"
        else
            log_warning "VITE_API_URL not found in .env, using default"
            VITE_API_URL="http://localhost:3000/api"
        fi
    fi

    # Create frontend .env
    cat > "$APP_DIR/frontend/.env" <<EOF
VITE_API_URL=$VITE_API_URL
EOF

    chown "$APP_USER:$APP_USER" "$APP_DIR/frontend/.env"
    chmod 644 "$APP_DIR/frontend/.env"

    log_success "Frontend .env file created"
}

install_dependencies() {
    log_info "Installing application dependencies..."

    # Install PM2 globally if not already installed
    if ! command -v pm2 &> /dev/null; then
        log_info "Installing PM2 globally..."
        npm install -g pm2
    else
        log_info "PM2 already installed"
    fi

    # Install backend dependencies
    log_info "Installing backend dependencies..."
    cd "$APP_DIR/backend"
    sudo -u "$APP_USER" npm install --production

    # Install frontend dependencies and build
    log_info "Installing frontend dependencies..."
    cd "$APP_DIR/frontend"
    sudo -u "$APP_USER" npm install

    log_info "Building frontend... (this may take a few minutes)"
    sudo -u "$APP_USER" npm run build

    log_success "Dependencies installed and frontend built"
}

create_ecosystem_config() {
    log_info "Creating PM2 ecosystem configuration..."

    cat > "$APP_DIR/ecosystem.config.js" <<EOF
module.exports = {
  apps: [
    {
      name: 'tradetally-backend',
      cwd: '$APP_DIR/backend',
      script: 'src/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: $BACKEND_PORT
      },
      error_file: '$APP_DIR/backend/logs/pm2-error.log',
      out_file: '$APP_DIR/backend/logs/pm2-out.log',
      log_file: '$APP_DIR/backend/logs/pm2-combined.log',
      time: true
    }
  ]
};
EOF

    chown "$APP_USER:$APP_USER" "$APP_DIR/ecosystem.config.js"

    # Create logs directory
    mkdir -p "$APP_DIR/backend/logs"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR/backend/logs"

    log_success "PM2 ecosystem configuration created"
}

################################################################################
# Systemd Service
################################################################################

create_systemd_service() {
    log_info "Creating systemd service..."

    cat > /etc/systemd/system/tradetally.service <<EOF
[Unit]
Description=TradeTally Trading Journal Application
Documentation=https://github.com/GeneBO98/tradetally
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=forking
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR

# Environment
Environment=NODE_ENV=production
Environment=PATH=/usr/bin:/usr/local/bin
Environment=PM2_HOME=/home/$APP_USER/.pm2

# Start command
ExecStart=/usr/bin/pm2 start $APP_DIR/ecosystem.config.js
ExecReload=/usr/bin/pm2 reload $APP_DIR/ecosystem.config.js
ExecStop=/usr/bin/pm2 stop $APP_DIR/ecosystem.config.js

# Restart policy
Restart=on-failure
RestartSec=10s

# Security
NoNewPrivileges=true
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=tradetally

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload

    log_success "Systemd service created"
}

################################################################################
# Nginx Configuration
################################################################################

configure_nginx() {
    log_info "Configuring Nginx..."

    # Backup existing nginx config if it exists
    if [ -f "/etc/nginx/sites-available/$NGINX_SITE_NAME" ]; then
        cp "/etc/nginx/sites-available/$NGINX_SITE_NAME" "$BACKUP_DIR/nginx-config-backup"
        log_info "Backed up existing Nginx config"
    fi

    # Extract domain from .env
    FRONTEND_URL=$(grep "^FRONTEND_URL=" "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")
    DOMAIN=$(echo "$FRONTEND_URL" | sed 's|https\?://||' | cut -d'/' -f1 | cut -d':' -f1)

    if [ -z "$DOMAIN" ]; then
        log_warning "Could not extract domain from FRONTEND_URL in .env"
        read -p "Enter your domain (e.g., tradetally.io): " DOMAIN
    else
        log_info "Using domain from .env: $DOMAIN"
    fi

    # Create Nginx configuration (HTTP only)
    cat > "/etc/nginx/sites-available/$NGINX_SITE_NAME" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    # Root directory for frontend
    root $APP_DIR/frontend/dist;
    index index.html;

    # Logging
    access_log /var/log/nginx/tradetally-access.log;
    error_log /var/log/nginx/tradetally-error.log;

    # ACME challenge for Let's Encrypt (for future SSL)
    location /.well-known/acme-challenge/ {
        root /var/www/html;
        try_files \$uri =404;
    }

    # API proxy
    location /api {
        proxy_pass http://localhost:$BACKEND_PORT;
        proxy_http_version 1.1;

        # Headers
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';

        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;

        # File upload limits
        client_max_body_size 52M;

        # Disable cache for API
        proxy_cache_bypass \$http_upgrade;
    }

    # Frontend routing (SPA)
    location / {
        try_files \$uri \$uri/ /index.html;

        # Cache static assets
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
EOF

    # Create ACME challenge directory
    mkdir -p /var/www/html/.well-known/acme-challenge
    chown -R www-data:www-data /var/www/html

    # Remove default site if exists
    rm -f /etc/nginx/sites-enabled/default

    # Enable site
    ln -sf "/etc/nginx/sites-available/$NGINX_SITE_NAME" "/etc/nginx/sites-enabled/$NGINX_SITE_NAME"

    # Test configuration
    if nginx -t; then
        log_success "Nginx configuration valid"
    else
        log_error "Nginx configuration test failed"
        exit 1
    fi
}

################################################################################
# Start Services
################################################################################

start_services() {
    log_info "Starting services..."

    # Start PM2 as the app user first (not via systemd)
    log_info "Starting application with PM2..."
    cd "$APP_DIR"
    sudo -u "$APP_USER" pm2 start ecosystem.config.js
    sudo -u "$APP_USER" pm2 save

    # Wait a moment for app to start
    sleep 5

    # Check if app is running
    if sudo -u "$APP_USER" pm2 list | grep -q "tradetally-backend.*online"; then
        log_success "Application started with PM2"
    else
        log_error "Application failed to start with PM2"
        sudo -u "$APP_USER" pm2 logs tradetally-backend --lines 50
        exit 1
    fi

    # Now enable and start the systemd service (which manages PM2)
    systemctl enable tradetally.service
    
    # Restart Nginx
    systemctl restart nginx

    if systemctl is-active --quiet nginx; then
        log_success "Nginx restarted successfully"
    else
        log_error "Nginx failed to start"
        nginx -t
        exit 1
    fi
}

################################################################################
# Stop Docker Containers
################################################################################

stop_docker_containers() {
    log_info "Docker container management..."

    echo ""
    log_warning "Do you want to stop and remove the Docker containers now?"
    read -p "This will stop the old Docker installation (yes/no): " -r

    if [[ $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        # Try to find and stop containers
        CONTAINERS=$(docker ps -a --filter "name=tradetally" --format "{{.Names}}")
        
        if [ -n "$CONTAINERS" ]; then
            log_info "Stopping TradeTally containers..."
            echo "$CONTAINERS" | xargs docker stop
            echo "$CONTAINERS" | xargs docker rm
            log_success "Docker containers stopped and removed"
        else
            log_info "No TradeTally containers found"
        fi
    else
        log_info "Docker containers left running. Stop them manually when ready."
    fi
}

################################################################################
# SSL Setup Instructions
################################################################################

print_completion_info() {
    # Extract domain from .env
    FRONTEND_URL=$(grep "^FRONTEND_URL=" "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '\r' | tr -d '"' | tr -d "'")
    DOMAIN=$(echo "$FRONTEND_URL" | sed 's|https\?://||' | cut -d'/' -f1 | cut -d':' -f1)

    echo ""
    echo "================================================================================"
    log_success "Migration completed successfully!"
    echo "================================================================================"
    echo ""
    log_info "Application Status:"
    echo ""
    sudo -u "$APP_USER" pm2 list
    echo ""
    log_info "Next steps:"
    echo ""
    echo "1. Test your application:"
    echo "   - Visit: http://$DOMAIN"
    echo ""
    echo "2. Set up SSL certificates with Certbot:"
    echo "   If using Cloudflare proxy:"
    echo "     sudo certbot certonly --manual --preferred-challenges dns -d $DOMAIN -d www.$DOMAIN"
    echo ""
    echo "   If NOT using Cloudflare proxy (direct DNS):"
    echo "     sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
    echo ""
    echo "3. Monitor your application:"
    echo "   - Service status: sudo systemctl status tradetally"
    echo "   - PM2 status: sudo -u $APP_USER pm2 status"
    echo "   - PM2 logs: sudo -u $APP_USER pm2 logs tradetally-backend"
    echo "   - System logs: sudo journalctl -u tradetally -f"
    echo "   - Nginx logs: sudo tail -f /var/log/nginx/tradetally-error.log"
    echo ""
    echo "4. Useful commands:"
    echo "   - Restart app: sudo -u $APP_USER pm2 restart tradetally-backend"
    echo "   - Restart service: sudo systemctl restart tradetally"
    echo "   - Restart Nginx: sudo systemctl restart nginx"
    echo "   - View PM2 dashboard: sudo -u $APP_USER pm2 monit"
    echo ""
    echo "5. Backup location: $BACKUP_DIR"
    echo ""
    echo "================================================================================"
}

################################################################################
# Main Execution
################################################################################

main() {
    echo "================================================================================"
    echo "          TradeTally Docker to Native Migration Script"
    echo "================================================================================"
    echo ""

    # Pre-flight checks
    check_root
    check_prerequisites
    prompt_confirmation

    # Create backup directory
    create_backup_dir

    # Database migration
    export_docker_database
    create_native_database
    import_database

    # Application setup
    setup_env_files
    install_dependencies
    create_ecosystem_config

    # System configuration
    create_systemd_service
    configure_nginx

    # Start everything
    start_services

    # Cleanup (optional)
    stop_docker_containers

    # Final info
    print_completion_info
}

# Run main function
main
