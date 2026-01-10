#!/bin/bash

# TradeTally Native Deployment Script
# Usage: ./deploy-native.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "[DEPLOY] Starting native deployment..."

# Pull latest changes
echo "[DEPLOY] Pulling latest changes from git..."
git pull origin main

# Install backend dependencies if package.json changed
echo "[DEPLOY] Checking backend dependencies..."
cd backend
npm install --production
cd ..

# Build frontend
echo "[DEPLOY] Building frontend..."
cd frontend
npm install
npm run build
cd ..

# Run database migrations
echo "[DEPLOY] Running database migrations..."
cd backend
npm run migrate
cd ..

# Restart backend
echo "[DEPLOY] Restarting backend..."
pm2 restart all

# Reload nginx
echo "[DEPLOY] Reloading nginx..."
sudo nginx -s reload

echo "[DEPLOY] Deployment complete!"
