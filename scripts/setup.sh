#!/bin/bash

# Setup script for TradeTally

echo "[SETUP] Setting up TradeTally..."

if ! command -v pnpm >/dev/null 2>&1; then
    echo "[ERROR] pnpm is required. Install it with: npm install -g pnpm@10.13.1"
    exit 1
fi

# Install dependencies
pnpm install

# Backend env setup
if [ ! -f backend/.env ]; then
    cd backend
    cp .env.example .env
    cd ..
    echo "[OK] Created .env file - Please update with your database credentials"
fi

echo "[SUCCESS] Setup complete!"
echo ""
echo "Next steps:"
echo "1. Update backend/.env with your PostgreSQL database credentials"
echo "2. Create the database: createdb tradetally"
echo "3. Run migrations: cd backend && pnpm run migrate"
echo "4. Start backend: pnpm --dir backend run dev"
echo "5. Start frontend: pnpm --dir frontend run dev"
