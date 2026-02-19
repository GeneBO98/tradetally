#!/bin/bash

# TradeTally Native Update Script
# Usage: ./update-native.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

echo "[UPDATE] Pulling latest changes..."
git pull origin main

echo "[UPDATE] Building frontend..."
cd frontend && npm run build && cd ..

echo "[UPDATE] Restarting backend..."
pm2 restart all

echo "[UPDATE] Reloading nginx..."
sudo nginx -s reload

echo "[UPDATE] Done!"
