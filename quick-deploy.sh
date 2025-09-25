#!/bin/bash

echo "[DEPLOY] TradeTally Quick Deploy Script"
echo "=================================="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "[ERROR] Docker Compose is not installed. Please install Docker Compose first."
    echo "Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

echo "[OK] Docker is installed"

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

curl -s -o docker-compose.yml https://raw.githubusercontent.com/YOUR_USERNAME/trader-vue/main/docker-compose.production.yaml
curl -s -o .env.example https://raw.githubusercontent.com/YOUR_USERNAME/trader-vue/main/.env.production.example
curl -s -o schema.sql https://raw.githubusercontent.com/YOUR_USERNAME/trader-vue/main/schema.sql

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "[CONFIG] Creating .env file from template..."
    cp .env.example .env
    
    # Generate a random JWT secret
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || echo "CHANGE_THIS_JWT_SECRET_$(date +%s)")
    sed -i.bak "s/your_super_secure_jwt_secret_key_change_this_in_production/${JWT_SECRET}/" .env
    
    # Generate a random database password
    DB_PASSWORD=$(openssl rand -base64 16 2>/dev/null || echo "secure_db_pass_$(date +%s)")
    sed -i.bak "s/your_secure_database_password_here/${DB_PASSWORD}/" .env
    
    echo "[SECURITY] Generated secure JWT secret and database password"
fi

# Update docker-compose.yml with correct image name
echo "[CONFIG] Please update the Docker image name in docker-compose.yml"
echo "Replace 'YOUR_DOCKERHUB_USERNAME/tradetally:latest' with your actual image name"
read -p "Enter your Docker Hub image name (e.g., username/tradetally:latest): " IMAGE_NAME

if [ ! -z "$IMAGE_NAME" ]; then
    sed -i.bak "s|YOUR_DOCKERHUB_USERNAME/tradetally:latest|${IMAGE_NAME}|" docker-compose.yml
    echo "[OK] Updated image name to: $IMAGE_NAME"
fi

# Create directories
mkdir -p logs data

# Start deployment
echo "[DEPLOY] Starting TradeTally deployment..."
docker-compose up -d

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
echo "   TradeTally: http://localhost"
echo "   Database Admin: http://localhost:8080"
echo ""
echo "[DEMO] Demo Login:"
echo "   Email: demo@example.com"
echo "   Password: DemoUser25"
echo ""
echo "[CONFIG] To customize settings, edit the .env file and restart:"
echo "   docker-compose restart"
echo ""
echo "[COMMANDS] Useful commands:"
echo "   View logs: docker-compose logs -f"
echo "   Stop: docker-compose down"
echo "   Update: docker-compose pull && docker-compose up -d"
echo ""