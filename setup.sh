#!/bin/bash

# Setup script for TraderVue

echo "[SETUP] Setting up TraderVue..."

# Backend setup
echo "[SETUP] Setting up backend..."
cd backend

# Remove node_modules and package-lock if they exist
rm -rf node_modules package-lock.json

# Install dependencies
npm install

# Copy env file if it doesn't exist
if [ ! -f .env ]; then
    cp .env.example .env
    echo "[OK] Created .env file - Please update with your database credentials"
fi

cd ..

# Frontend setup
echo "[SETUP] Setting up frontend..."
cd frontend

# Remove node_modules and package-lock if they exist
rm -rf node_modules package-lock.json

# Install dependencies
npm install

cd ..

echo "[SUCCESS] Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update backend/.env with your PostgreSQL database credentials"
echo "2. Create the database: createdb tradervue_db"
echo "3. Run migrations: psql -U your_user -d tradervue_db -f backend/src/utils/schema.sql"
echo "4. Start backend: cd backend && npm run dev"
echo "5. Start frontend: cd frontend && npm run dev"