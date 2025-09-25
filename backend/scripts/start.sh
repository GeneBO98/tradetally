#!/bin/bash

# Start script for TradeTally backend
# This script runs database migrations before starting the application

echo "[START] Starting TradeTally Backend..."

# Wait for database to be ready
echo "[PROCESS] Waiting for database to be ready..."
while ! nc -z ${DB_HOST:-localhost} ${DB_PORT:-5432}; do
  sleep 1
done
echo "[SUCCESS] Database is ready!"

# Run database migrations
echo "[PROCESS] Running database migrations..."
node scripts/migrate.js

# Check if migrations were successful
if [ $? -eq 0 ]; then
  echo "[SUCCESS] Database migrations completed successfully!"
else
  echo "[ERROR] Database migrations failed!"
  exit 1
fi

# Start the application
echo "[TARGET] Starting application..."
if [ "$NODE_ENV" = "production" ]; then
  npm start
else
  npm run dev
fi