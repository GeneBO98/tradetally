#!/bin/bash

echo "[DEPLOY] Deploying TradeTally..."

# Build only the app service (not the database)
echo "[BUILD] Building app container..."
docker-compose build app

# Stop only the app service
echo "[STOP] Stopping app service..."
docker-compose stop app

# Start the app service
echo "[START] Starting app service..."
docker-compose up -d app

# Initialize database if needed
echo "[DB] Checking database..."
./init-db.sh

echo "[SUCCESS] Deployment complete!"
echo "[INFO] App available at: http://localhost"