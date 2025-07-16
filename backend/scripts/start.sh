#!/bin/bash

# Start script for TradeTally backend
# This script runs database migrations before starting the application

echo "🚀 Starting TradeTally Backend..."

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
while ! nc -z ${DB_HOST:-localhost} ${DB_PORT:-5432}; do
  sleep 1
done
echo "✅ Database is ready!"

# Run database migrations
echo "🔄 Running database migrations..."
node scripts/migrate.js

# Check if migrations were successful
if [ $? -eq 0 ]; then
  echo "✅ Database migrations completed successfully!"
else
  echo "❌ Database migrations failed!"
  exit 1
fi

# Start the application
echo "🎯 Starting application..."
if [ "$NODE_ENV" = "production" ]; then
  npm start
else
  npm run dev
fi