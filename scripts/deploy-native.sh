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

# Install repo-managed nginx snippets, then reload nginx
echo "[DEPLOY] Installing nginx snippets..."
if [ -f scripts/nginx/tradetally-og.conf ]; then
  sudo mkdir -p /etc/nginx/snippets
  sudo cp scripts/nginx/tradetally-og.conf /etc/nginx/snippets/tradetally-og.conf
  if ! sudo grep -Rqs "tradetally-og.conf" /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null; then
    echo "[DEPLOY] NOTICE: add 'include /etc/nginx/snippets/tradetally-og.conf;' inside the tradetally server { } block (one-time step)"
  fi
fi

echo "[DEPLOY] Reloading nginx..."
sudo nginx -t && sudo nginx -s reload

echo "[DEPLOY] Deployment complete!"
