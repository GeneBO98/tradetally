#!/bin/bash

set -euo pipefail

echo "[DEPLOY] TradeTally Quick Deploy Script"
echo "=================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
elif command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
else
    echo "[ERROR] Docker Compose is not installed. Please install Docker Compose first."
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "[OK] Docker is installed"
echo "[OK] Docker Compose is installed"

# Create deployment directory
DEPLOY_DIR="tradetally-deployment"
if [ -d "$DEPLOY_DIR" ]; then
    echo "[INFO] Directory $DEPLOY_DIR already exists. Using existing directory."
    cd "$DEPLOY_DIR"
else
    echo "[INFO] Creating deployment directory: $DEPLOY_DIR"
    mkdir "$DEPLOY_DIR"
    cd "$DEPLOY_DIR"
fi

# Download required files
echo "[INFO] Downloading deployment files..."

REPO_RAW_URL="https://raw.githubusercontent.com/GeneBO98/tradetally/refs/heads/main"

download_file() {
    local url="$1"
    local output="$2"

    if ! curl -fsSL "$url" -o "$output"; then
        echo "[ERROR] Failed to download $url"
        exit 1
    fi
}

download_file "$REPO_RAW_URL/docker-compose.yaml" docker-compose.yml
download_file "https://raw.githubusercontent.com/GeneBO98/tradetally/main/.env.example" .env.example
download_file "$REPO_RAW_URL/backend/src/utils/schema.sql" schema.sql

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "[CONFIG] Creating .env file from template..."
    cp .env.example .env
    
    # Generate delimiter-safe secrets for sed replacement.
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "CHANGE_THIS_JWT_SECRET_$(date +%s)")
    sed -i.bak \
        -e "s|your_super_secret_jwt_key_change_this_in_production|${JWT_SECRET}|g" \
        -e "s|your_super_secure_jwt_secret_key_change_this_in_production|${JWT_SECRET}|g" \
        .env

    # Generate a random database password.
    DB_PASSWORD=$(openssl rand -hex 16 2>/dev/null || echo "secure_db_pass_$(date +%s)")
    sed -i.bak \
        -e "s|trader_password|${DB_PASSWORD}|g" \
        -e "s|your_secure_database_password_here|${DB_PASSWORD}|g" \
        .env

    rm -f .env.bak

    echo "[SECURITY] Generated secure JWT secret and database password"
fi

# Create directories
mkdir -p backend/src/logs backend/src/data backend/uploads

# Start deployment
echo "[DEPLOY] Starting TradeTally deployment..."
$DOCKER_COMPOSE up -d

# Wait for database to be ready
echo "[WAIT] Waiting for database to be ready..."
sleep 10

# Initialize database schema
echo "[DB] Initializing database schema..."
docker exec -i tradetally-db psql -U trader -d tradetally < schema.sql 2>/dev/null || echo "Schema may already exist"

echo ""
echo "[SUCCESS] TradeTally deployment complete!"
echo ""
echo "[INFO] Access your application:"
echo "   TradeTally: http://localhost:8080"
echo ""
echo "[DEMO] Demo Login:"
echo "   Email: demo@example.com"
echo "   Password: DemoUser25"
echo ""
echo "[CONFIG] To customize settings, edit the .env file and restart:"
echo "   $DOCKER_COMPOSE restart"
echo ""
echo "[COMMANDS] Useful commands:"
echo "   View logs: $DOCKER_COMPOSE logs -f"
echo "   Stop: $DOCKER_COMPOSE down"
echo "   Update: $DOCKER_COMPOSE pull && $DOCKER_COMPOSE up -d"
echo ""
