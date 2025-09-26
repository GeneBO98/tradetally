# TradeTally Mobile Support Migration Guide

This guide explains how to upgrade your existing TradeTally deployment to support mobile applications with both cloud and self-hosted options.

## Overview

The mobile support upgrade adds:
- [CHECK] API versioning (`/api/v1/`)
- [CHECK] Refresh token authentication for mobile apps
- [CHECK] Device management and tracking
- [CHECK] Server discovery for mobile app configuration
- [CHECK] Sync infrastructure for offline capabilities
- [CHECK] Instance configuration (cloud vs self-hosted)
- [CHECK] Automatic database migrations

## Migration Methods

### Method 1: Automatic Migration (Recommended)

For existing Docker deployments, use the automated migration script:

```bash
# Navigate to your TradeTally directory
cd /path/to/your/tradetally

# Run the migration script
./scripts/migrate-existing-deployment.sh
```

This script will:
1. [SEARCH] Detect your running TradeTally containers
2. [BACKUP] Create a database backup
3. [SYNC] Run all necessary database migrations
4. [EDIT] Update Docker configuration
5. [SYNC] Restart services if needed

### Method 2: Manual Migration

If you prefer manual control or have a custom setup:

#### Step 1: Backup Your Database
```bash
# Create a backup
docker exec tradetally-db pg_dump -U trader -d tradetally > backup_$(date +%Y%m%d).sql
```

#### Step 2: Run Database Migrations
```bash
# Copy the migration script to your container
docker cp backend/src/utils/migrate.js tradetally-app:/app/backend/src/utils/

# Copy migration files
docker cp backend/migrations/ tradetally-app:/app/backend/

# Run migrations
docker exec tradetally-app node /app/backend/src/utils/migrate.js
```

#### Step 3: Update Environment Variables
Add these variables to your `.env` file:

```env
# Instance Configuration
INSTANCE_NAME=TradeTally
INSTANCE_URL=https://your-domain.com

# Mobile Authentication
ACCESS_TOKEN_EXPIRE=15m
REFRESH_TOKEN_EXPIRE=30d

# Migration Control
RUN_MIGRATIONS=true

# CORS for Mobile
CORS_ORIGINS=http://localhost:5173,https://your-domain.com

# Features
ENABLE_MOBILE_SYNC=true
ENABLE_DEVICE_TRACKING=true
MAX_DEVICES_PER_USER=10
```

#### Step 4: Restart Services
```bash
# Restart your TradeTally containers
docker-compose restart
```

## New Database Tables

The migration adds these new tables:

### `devices`
Tracks user devices for mobile app support
- Device information (name, type, model)
- Device fingerprinting for security
- Push notification tokens
- Trust levels and activity tracking

### `refresh_tokens`
Manages long-lived authentication tokens
- Token rotation support
- Device-specific tokens
- Automatic expiration and cleanup
- Revocation tracking

### `sync_metadata`
Tracks data changes for mobile sync
- Change tracking for all entities
- Conflict resolution support
- Incremental sync capabilities
- Device-specific sync state

### `instance_config`
Stores instance-specific configuration
- Feature flags
- Mobile app settings
- Security configuration
- Public configuration for app discovery

## New API Endpoints

After migration, these new endpoints are available:

### Server Discovery
```http
GET /api/v1/server/info
GET /.well-known/tradetally-config.json
```

### Enhanced Authentication
```http
POST /api/v1/auth/login      # Returns access + refresh tokens
POST /api/v1/auth/refresh    # Refresh access token
POST /api/v1/auth/logout     # Revoke tokens
```

### Device Management
```http
GET    /api/v1/devices       # List user devices
POST   /api/v1/devices       # Register new device
DELETE /api/v1/devices/:id   # Remove device
```

### Mobile Sync
```http
GET  /api/v1/sync/full       # Full data sync
POST /api/v1/sync/delta      # Incremental sync
```

## Configuration Options

### Instance Configuration

All self-hosted deployments use the same configuration:
```env
INSTANCE_NAME=TradeTally
INSTANCE_URL=https://your-domain.com
```

The mobile app will automatically detect if it's connecting to `tradetally.io` (cloud) or a self-hosted instance based on the domain.

### Mobile Features

Enable/disable mobile features:
```env
ENABLE_MOBILE_SYNC=true
ENABLE_PUSH_NOTIFICATIONS=false
ENABLE_DEVICE_TRACKING=true
ENABLE_BIOMETRIC_AUTH=true
MAX_DEVICES_PER_USER=10
```

### Security Settings

Configure mobile security:
```env
ACCESS_TOKEN_EXPIRE=15m      # Short-lived tokens
REFRESH_TOKEN_EXPIRE=30d     # Long-lived refresh
SESSION_TIMEOUT_MINUTES=60   # Idle timeout
REQUIRE_HTTPS=true           # Force HTTPS
```

## Mobile App Integration

### Server Discovery Flow

Mobile apps can discover your server configuration:

1. **Manual Entry**: User enters `https://your-domain.com`
2. **Auto-Discovery**: App fetches `/.well-known/tradetally-config.json`
3. **Configuration**: App configures API endpoints and features

### Authentication Flow

1. **Login**: User authenticates, receives access + refresh tokens
2. **Device Registration**: App registers device with fingerprint
3. **Token Refresh**: App automatically refreshes short-lived access tokens
4. **Multi-Device**: User can authenticate on multiple devices

### Sync Flow

1. **Initial Sync**: Full data download on first app launch
2. **Delta Sync**: Incremental updates during app usage
3. **Conflict Resolution**: Automatic handling of data conflicts
4. **Offline Support**: Queue changes when offline, sync when online

## Verification

After migration, verify the setup:

### 1. Check Database Tables
```bash
docker exec tradetally-db psql -U trader -d tradetally -c "\dt"
```

Should show the new tables: `devices`, `refresh_tokens`, `sync_metadata`, `instance_config`

### 2. Test API Endpoints
```bash
# Test server discovery
curl https://your-domain.com/api/v1/server/info

# Test well-known config
curl https://your-domain.com/.well-known/tradetally-config.json
```

### 3. Check Migration Status
```bash
docker exec tradetally-app node /app/backend/src/utils/migrate.js
```

Should show "0 migration(s) applied" if all migrations are current.

## Troubleshooting

### Migration Fails
1. Check database connection
2. Verify container names match your setup
3. Check logs: `docker logs tradetally-app`
4. Restore from backup if needed

### API Not Responding
1. Check if containers restarted properly
2. Verify environment variables are loaded
3. Check nginx configuration
4. Verify database migrations completed

### Mobile App Can't Connect
1. Verify CORS_ORIGINS includes your domain
2. Check HTTPS certificate (required for mobile)
3. Test server discovery endpoint manually
4. Verify firewall/port configuration

## Rollback Procedure

If you need to rollback:

1. **Stop containers**:
   ```bash
   docker-compose down
   ```

2. **Restore database**:
   ```bash
   docker exec -i tradetally-db psql -U trader -d tradetally < your_backup.sql
   ```

3. **Revert code**:
   ```bash
   git checkout previous-version
   ```

4. **Restart**:
   ```bash
   docker-compose up -d
   ```

## Support

For issues with the mobile migration:

1. Check the troubleshooting section above
2. Review container logs for error messages
3. Verify your backup was created successfully
4. Test with a fresh development environment first

The migration is designed to be safe and backwards-compatible. Your existing web interface will continue to work exactly as before, with new mobile capabilities added alongside.