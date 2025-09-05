# TradeTally - Claude Code Assistant Context

This file contains important context and constraints for Claude Code when working on the TradeTally project. **DO NOT** modify or remove information in this file unless explicitly requested by the user.

## Project Overview

**TradeTally** is a comprehensive trading journal and analytics platform with Vue.js frontend and Node.js backend that helps traders track performance, analyze patterns, and gain insights across multiple brokers.

**Live Demo:** https://tradetally.io  
**GitHub Repository:** https://github.com/GeneBO98/tradetally  
**Docker Hub:** https://hub.docker.com/r/potentialmidas/tradetally  
**TestFlight (iOS):** https://testflight.apple.com/join/11shUY3t

## CRITICAL: Repository and URL Information

**NEVER** change or replace these specific URLs and identifiers:

### GitHub Repository
- **Owner:** GeneBO98
- **Repository:** tradetally
- **Main Branch:** main
- **Issues URL:** https://github.com/GeneBO98/tradetally/issues

### Deployment URLs (used in DEPLOYMENT.md and other files)
- Docker Compose: `https://raw.githubusercontent.com/GeneBO98/tradetally/refs/heads/main/docker-compose.yaml`
- Environment Template: `https://raw.githubusercontent.com/GeneBO98/tradetally/main/.env.example`

### Docker Configuration
- **Docker Image:** potentialmidas/tradetally:latest
- **Docker Hub:** https://hub.docker.com/r/potentialmidas/tradetally

### Other Important URLs
- **Live Demo:** https://tradetally.io
- **Privacy Policy GitHub Link:** https://github.com/GeneBO98/tradetally
- **Mobile App GitHub:** https://github.com/tradetally/mobile-app

## Project Structure

```
tradetally/
├── backend/                 # Node.js/Express API
│   ├── src/
│   │   ├── controllers/     # Request handlers
│   │   ├── models/         # Database models (PostgreSQL)
│   │   ├── routes/         # API routes
│   │   ├── middleware/     # Auth, validation, error handling
│   │   ├── services/       # Business logic
│   │   └── utils/          # Utilities (AI, CSV parsing, etc.)
│   ├── migrations/         # Database schema migrations
│   └── package.json        # Backend dependencies
├── frontend/               # Vue.js 3 application
│   ├── src/
│   │   ├── components/     # Reusable Vue components
│   │   ├── views/          # Page components
│   │   ├── stores/         # Pinia state management
│   │   ├── router/         # Vue Router configuration
│   │   └── services/       # API client
│   └── package.json        # Frontend dependencies
├── docker-compose.yaml     # Production Docker setup
├── docker-compose.dev.yaml # Development Docker setup
└── DEPLOYMENT.md           # Docker deployment guide
```

## Technology Stack

### Backend
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** PostgreSQL 15+
- **Authentication:** JWT with bcrypt
- **External APIs:** Finnhub, Alpha Vantage, Google Gemini AI
- **File Processing:** Multer, CSV parsing
- **Logging:** Winston-like custom logger

### Frontend
- **Framework:** Vue.js 3 with Composition API
- **State Management:** Pinia
- **Routing:** Vue Router 4
- **Styling:** Tailwind CSS
- **Charts:** Chart.js, Lightweight Charts
- **Icons:** Heroicons
- **Date Handling:** date-fns
- **Build Tool:** Vite

### Infrastructure
- **Containerization:** Docker & Docker Compose
- **Web Server:** Nginx (in Docker)
- **Database:** PostgreSQL with connection pooling
- **Reverse Proxy:** Nginx
- **File Storage:** Local filesystem with volume mounts

## Key Features

1. **Multi-Broker Support** - Import from Lightspeed, Schwab, ThinkorSwim, IBKR, E*TRADE
2. **CUSIP Resolution** - Auto-convert CUSIP codes to ticker symbols
3. **Real-time Market Data** - Live quotes via Finnhub API
4. **AI Analytics** - Google Gemini-powered recommendations
5. **Trade Chart Visualization** - Interactive candlestick charts
6. **Comprehensive Analytics** - P&L tracking, win rates, performance metrics
7. **Mobile App Support** - REST API with device management
8. **Registration Control** - Configurable user registration modes
9. **Duplicate Trade Detection** - Working implementation prevents duplicate trade imports

## Environment Variables

### Required Variables
- `DB_USER` - Database username (default: trader)
- `DB_PASSWORD` - Database password (MUST be changed)
- `DB_NAME` - Database name (default: tradetally)
- `JWT_SECRET` - JWT signing secret (MUST be changed)

### Important Optional Variables
- `NODE_ENV` - Environment (production/development)
- `PORT` - Backend port (default: 3000)
- `FRONTEND_URL` - Frontend URL for CORS
- `VITE_API_URL` - Frontend API URL
- `REGISTRATION_MODE` - User registration control (open/approval/disabled)

### External API Keys
- `FINNHUB_API_KEY` - Real-time quotes and CUSIP resolution
- `ALPHA_VANTAGE_API_KEY` - Trade chart visualization
- `GEMINI_API_KEY` - AI-powered analytics

## Database Information

- **Primary Database:** PostgreSQL 15-alpine
- **Connection Pooling:** Built-in pg pool
- **Migrations:** Sequential numbered SQL files in `/backend/migrations/`
- **Key Tables:** trades, users, trade_attachments, trade_comments, symbol_categories

## Known Issues & Fixes Applied

### Date/Timezone Handling
- **Issue:** Inconsistent date display across Trade List, Detail, and Form views
- **Root Cause:** Timezone conversion causing date shifts (e.g., July 4 → July 3)
- **Fix Applied:** Enhanced date formatting in frontend components and backend date storage to handle local dates properly

### Authentication & Security
- JWT-based authentication with refresh tokens
- CORS configured for mobile app support
- Rate limiting on API endpoints
- Input validation and sanitization

## Development Commands

### Backend Development
```bash
cd backend
npm install
npm run dev          # Start with nodemon
npm run migrate      # Run database migrations
npm test            # Run tests
```

### Frontend Development
```bash
cd frontend
npm install
npm run dev         # Start Vite dev server
npm run build       # Build for production
npm run preview     # Preview production build
```

### Docker Commands
```bash
# Development
docker-compose -f docker-compose.dev.yaml up -d

# Production
docker-compose up -d

# View logs
docker-compose logs -f app
```

## Deployment Information

### Docker Images
- **Production Image:** potentialmidas/tradetally:latest
- **Base Images:** node:18-alpine, postgres:15-alpine
- **Services:** app, postgres, adminer (optional)

### Ports
- **Frontend/Nginx:** 80
- **Backend API:** 3000
- **Database:** 5432
- **Adminer:** 8080

### Volume Mounts
- `postgres_data` - PostgreSQL data persistence
- `./backend/src/logs` - Application logs
- `./backend/src/data` - Application data

## API Documentation

- REST API with JSON responses
- JWT authentication required for protected endpoints
- Mobile API v1 available at `/api/v1/`
- Rate limiting implemented
- Comprehensive error handling and validation

## Testing & Quality

### Demo Account
- **Email:** demo@example.com  
- **Password:** DemoUser25

### Test Scripts
- Backend: Jest testing framework
- API testing with supertest
- Database integration tests

## Coding Standards & Conventions

### Data Format Standards
- **Field Naming**: Use **camelCase** for JavaScript/frontend and API communication
- **Database Fields**: PostgreSQL uses snake_case in schema, but models should convert to camelCase for consistency
- **API Responses**: Always return data in camelCase format to frontend
- **Form Data**: Frontend forms send camelCase, backend models expect camelCase

### Examples:
```javascript
// ✅ Good - Frontend/API Format
{
  entryDate: '2025-09-05',
  marketBias: 'bullish',
  keyLevels: 'SPY 500'
}

// ❌ Bad - Don't mix formats
{
  entry_date: '2025-09-05',  // snake_case
  marketBias: 'bullish',     // camelCase
  key_levels: 'SPY 500'      // snake_case
}
```

## Common Pitfalls & Reminders

1. **NEVER replace GitHub URLs** - Always use `GeneBO98/tradetally` for repository references
2. **NEVER replace Docker Hub URLs** - Always use `potentialmidas/tradetally:latest`
3. **Environment Variables** - Always check `.env.example` for required configuration
4. **Database Migrations** - Run sequentially, never skip or reorder
5. **Date Handling** - Be mindful of timezone conversions in date operations
6. **Docker Networks** - Use defined networks for service communication
7. **CORS Configuration** - Mobile app requires specific CORS origins setup
8. **Field Naming Consistency** - Always use camelCase for API communication, let models handle database conversion

## Mobile App Integration

- iOS TestFlight available
- REST API with device management
- JWT refresh token flow
- Device tracking and limits
- File upload support (52MB default limit)

---

**Last Updated:** August 21, 2025  
**Claude Code Assistant:** Use this context to maintain consistency and avoid breaking changes to critical URLs and configurations.