#!/bin/bash

echo "🚀 Deploying TradeTally..."

# Build only the app service (not the database)
echo "📦 Building app container..."
docker-compose build app

# Stop only the app service
echo "⏹️ Stopping app service..."
docker-compose stop app

# Start the app service
echo "▶️ Starting app service..."
docker-compose up -d app

# Initialize database if needed
echo "🗄️ Checking database..."
./init-db.sh

echo "✅ Deployment complete!"
echo "🌐 App available at: http://localhost"