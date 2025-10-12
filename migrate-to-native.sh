#!/bin/bash

# TradeTally Docker to Native Migration Script
# This script migrates TradeTally from Docker to native services

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_USER="trader"
DB_PASSWORD="Outage-Undercut3-Elf"
DB_NAME="tradetally"
BACKUP_FILE=""
SKIP_POSTGRES_INSTALL=false
SKIP_NGINX_INSTALL=false
PRODUCTION_MODE=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --backup-file)
            BACKUP_FILE="$2"
            shift 2
            ;;
        --skip-postgres)
            SKIP_POSTGRES_INSTALL=true
            shift
            ;;
        --skip-nginx)
            SKIP_NGINX_INSTALL=true
            shift
            ;;
        --production)
            PRODUCTION_MODE=true
            shift
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --backup-file <path>  Path to PostgreSQL backup file"
            echo "  --skip-postgres       Skip PostgreSQL installation"
            echo "  --skip-nginx          Skip Nginx installation"
            echo "  --production          Run in production mode"
            echo "  --help                Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_status "Starting TradeTally migration from Docker to native services..."

# Detect OS
OS=""
if [[ "$OSTYPE" == "darwin"* ]]; then
    OS="macos"
    print_status "Detected macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    OS="linux"
    print_status "Detected Linux"
else
    print_error "Unsupported OS: $OSTYPE"
    exit 1
fi

# Step 1: Install PostgreSQL 16
if [ "$SKIP_POSTGRES_INSTALL" = false ]; then
    print_status "Installing PostgreSQL 16..."

    if [ "$OS" = "macos" ]; then
        # Check if Homebrew is installed
        if ! command -v brew &> /dev/null; then
            print_error "Homebrew is not installed. Please install it first."
            exit 1
        fi

        # Stop any existing PostgreSQL service
        brew services stop postgresql@14 2>/dev/null || true
        brew services stop postgresql@15 2>/dev/null || true

        # Install PostgreSQL 16
        brew install postgresql@16

        # Add to PATH
        echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
        export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"

        # Start PostgreSQL service
        brew services start postgresql@16

    elif [ "$OS" = "linux" ]; then
        # For Ubuntu/Debian
        if command -v apt-get &> /dev/null; then
            sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
            wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
            sudo apt-get update
            sudo apt-get install -y postgresql-16 postgresql-client-16
            sudo systemctl start postgresql
            sudo systemctl enable postgresql
        # For RHEL/CentOS/Rocky
        elif command -v yum &> /dev/null; then
            sudo yum install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-8-x86_64/pgdg-redhat-repo-latest.noarch.rpm
            sudo yum install -y postgresql16-server postgresql16
            sudo /usr/pgsql-16/bin/postgresql-16-setup initdb
            sudo systemctl enable postgresql-16
            sudo systemctl start postgresql-16
        else
            print_error "Unsupported Linux distribution"
            exit 1
        fi
    fi

    print_success "PostgreSQL 16 installed"
else
    print_warning "Skipping PostgreSQL installation"
fi

# Wait for PostgreSQL to be ready
print_status "Waiting for PostgreSQL to be ready..."
sleep 5

# Step 2: Create database and user
print_status "Creating database and user..."

if [ "$OS" = "macos" ]; then
    PSQL_CMD="psql"
    PSQL_ADMIN_USER="$USER"
else
    PSQL_CMD="sudo -u postgres psql"
    PSQL_ADMIN_USER="postgres"
fi

# Check if user exists, create if not
$PSQL_CMD -U $PSQL_ADMIN_USER -d postgres -tc "SELECT 1 FROM pg_user WHERE usename = '$DB_USER'" | grep -q 1 || \
    $PSQL_CMD -U $PSQL_ADMIN_USER -d postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD' CREATEDB;"

# Check if database exists, create if not
$PSQL_CMD -U $PSQL_ADMIN_USER -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1 || \
    $PSQL_CMD -U $PSQL_ADMIN_USER -d postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

# Grant privileges
$PSQL_CMD -U $PSQL_ADMIN_USER -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"

print_success "Database and user created"

# Step 3: Import backup if provided
if [ -n "$BACKUP_FILE" ]; then
    if [ -f "$BACKUP_FILE" ]; then
        print_status "Importing database backup from $BACKUP_FILE..."
        PGPASSWORD=$DB_PASSWORD psql -h localhost -U $DB_USER -d $DB_NAME < "$BACKUP_FILE"
        print_success "Database backup imported"
    else
        print_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi
else
    print_warning "No backup file provided. Database will be empty."
fi

# Step 4: Install Node.js dependencies
print_status "Installing Node.js dependencies..."

cd backend
npm install
print_success "Backend dependencies installed"

cd ../frontend
npm install
print_success "Frontend dependencies installed"

# Step 5: Build frontend
print_status "Building frontend for production..."
npm run build
print_success "Frontend built"

cd ..

# Step 6: Create environment file
print_status "Creating environment configuration..."

cat > backend/.env.production << EOF
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=$DB_USER
DB_PASSWORD=$DB_PASSWORD
DB_NAME=$DB_NAME

# Application
NODE_ENV=production
PORT=3000
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=7d

# Frontend URL
FRONTEND_URL=http://localhost
VITE_API_URL=http://localhost/api

# Registration
REGISTRATION_MODE=open

# External APIs (optional)
FINNHUB_API_KEY=
ALPHA_VANTAGE_API_KEY=
GEMINI_API_KEY=
EOF

print_success "Environment configuration created"

# Step 7: Run database migrations
print_status "Running database migrations..."
cd backend
SKIP_BASE_SCHEMA=true NODE_ENV=production npm run migrate
cd ..
print_success "Database migrations completed"

# Step 8: Install PM2
print_status "Installing PM2 for process management..."
npm install -g pm2
print_success "PM2 installed"

# Step 9: Create PM2 ecosystem file
print_status "Creating PM2 configuration..."

cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'tradetally-backend',
      script: './backend/src/server.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production'
      },
      env_file: './backend/.env.production'
    }
  ]
};
EOF

print_success "PM2 configuration created"

# Step 10: Start backend with PM2
print_status "Starting backend with PM2..."
pm2 start ecosystem.config.js
pm2 save
print_success "Backend started with PM2"

# Step 11: Install and configure Nginx
if [ "$SKIP_NGINX_INSTALL" = false ]; then
    print_status "Installing Nginx..."

    if [ "$OS" = "macos" ]; then
        brew install nginx
        NGINX_CONF_DIR="/opt/homebrew/etc/nginx"
        NGINX_SITES_DIR="$NGINX_CONF_DIR/servers"
        mkdir -p $NGINX_SITES_DIR

    elif [ "$OS" = "linux" ]; then
        if command -v apt-get &> /dev/null; then
            sudo apt-get install -y nginx
        elif command -v yum &> /dev/null; then
            sudo yum install -y nginx
        fi
        NGINX_CONF_DIR="/etc/nginx"
        NGINX_SITES_DIR="$NGINX_CONF_DIR/sites-available"
    fi

    print_success "Nginx installed"
else
    print_warning "Skipping Nginx installation"
    NGINX_CONF_DIR="/opt/homebrew/etc/nginx"
    NGINX_SITES_DIR="$NGINX_CONF_DIR/servers"
fi

# Step 12: Configure Nginx
print_status "Configuring Nginx..."

FRONTEND_BUILD_PATH="$(pwd)/frontend/dist"

cat > /tmp/tradetally.conf << EOF
server {
    listen 80;
    server_name localhost;

    # Frontend
    root $FRONTEND_BUILD_PATH;
    index index.html;

    # API proxy
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # Increase timeouts for long operations
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Frontend routes (SPA support)
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

if [ "$OS" = "macos" ]; then
    cp /tmp/tradetally.conf $NGINX_SITES_DIR/tradetally.conf

    # Start Nginx
    brew services restart nginx

elif [ "$OS" = "linux" ]; then
    sudo cp /tmp/tradetally.conf $NGINX_SITES_DIR/tradetally
    sudo ln -sf $NGINX_SITES_DIR/tradetally /etc/nginx/sites-enabled/tradetally

    # Remove default site if exists
    sudo rm -f /etc/nginx/sites-enabled/default

    # Test and restart Nginx
    sudo nginx -t
    sudo systemctl restart nginx
    sudo systemctl enable nginx
fi

print_success "Nginx configured"

# Step 13: Setup auto-start
if [ "$PRODUCTION_MODE" = true ]; then
    print_status "Setting up auto-start on boot..."

    if [ "$OS" = "macos" ]; then
        pm2 startup
        brew services start postgresql@16
        brew services start nginx

    elif [ "$OS" = "linux" ]; then
        pm2 startup systemd -u $USER --hp $HOME
        pm2 save
        sudo systemctl enable postgresql
        sudo systemctl enable nginx
    fi

    print_success "Auto-start configured"
fi

# Step 14: Verify installation
print_status "Verifying installation..."

# Check if backend is running
if curl -s http://localhost:3000/api/auth/config > /dev/null; then
    print_success "Backend API is running"
else
    print_error "Backend API is not responding"
fi

# Check if frontend is accessible
if curl -s http://localhost > /dev/null; then
    print_success "Frontend is accessible"
else
    print_error "Frontend is not accessible"
fi

# Print summary
echo ""
print_success "Migration completed successfully!"
echo ""
echo "Access TradeTally at: http://localhost"
echo ""
echo "Useful commands:"
echo "  pm2 status          - Check backend status"
echo "  pm2 logs            - View backend logs"
echo "  pm2 restart all     - Restart backend"
echo "  nginx -s reload     - Reload Nginx configuration"
echo ""

if [ "$PRODUCTION_MODE" = false ]; then
    print_warning "To enable auto-start on boot, run: $0 --production"
fi