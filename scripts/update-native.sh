#!/bin/bash

# TradeTally Native Update Script
# Usage: ./update-native.sh

set -e

cd "$(dirname "$0")/.."

echo "[UPDATE] Pulling latest changes..."
git pull origin main

echo "[UPDATE] Installing backend dependencies..."
cd backend && npm install && cd ..

echo "[UPDATE] Installing frontend dependencies and building..."
cd frontend && npm install && npm run build && cd ..

echo "[UPDATE] Restarting backend..."
pm2 restart all

echo "[UPDATE] Reloading nginx..."
sudo nginx -s reload

echo "[UPDATE] Done!"
