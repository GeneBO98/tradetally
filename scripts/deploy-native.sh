#!/bin/bash

# TradeTally Native Deployment Script
# Usage: ./deploy-native.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "[DEPLOY] Starting native deployment..."

# Pull latest changes
echo "[DEPLOY] Pulling latest changes from git..."
git pull origin main

# Install backend dependencies if package.json changed
echo "[DEPLOY] Checking backend dependencies..."
pnpm install --filter tradetally-backend --prod --frozen-lockfile

# Build frontend
echo "[DEPLOY] Building frontend..."
pnpm install --filter tradetally-frontend --frozen-lockfile
pnpm --dir frontend run build

# Run database migrations
echo "[DEPLOY] Running database migrations..."
pnpm --dir backend run migrate

# Restart backend
echo "[DEPLOY] Restarting backend..."
pm2 restart all

# Reload nginx
echo "[DEPLOY] Reloading nginx..."
sudo nginx -s reload

echo "[DEPLOY] Deployment complete!"
