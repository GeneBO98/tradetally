# TradeTally Mobile API Documentation

## Overview

The TradeTally Mobile API (v1) provides comprehensive endpoints for mobile applications to integrate with TradeTally instances. This API supports both cloud (tradetally.io) and self-hosted deployments with automatic server discovery.

## Base URL

```
https://your-server.com/api/v1
```

## Authentication

The API uses JWT-based authentication with refresh tokens for enhanced mobile security.

### Headers

All authenticated requests must include:

```http
Authorization: Bearer {access_token}
X-Device-ID: {device_uuid}
Content-Type: application/json
```

### Token Management

- **Access Tokens**: Short-lived (15 minutes), used for API requests
- **Refresh Tokens**: Long-lived (30 days), used to obtain new access tokens
- **Token Rotation**: New refresh token provided with each refresh

---

## [SEARCH] Server Discovery

### Get Server Information

Discover server configuration and capabilities for mobile app setup.

```http
GET /api/v1/server/info
```

**Response:**
```json
{
  "server": {
    "name": "TradeTally",
    "version": "v1",
    "url": "https://your-server.com",
    "isCloud": false,
    "timestamp": "2024-01-15T10:30:00Z"
  },
  "api": {
    "version": "v1",
    "baseUrl": "/api/v1",
    "endpoints": {
      "auth": "/api/v1/auth",
      "devices": "/api/v1/devices",
      "sync": "/api/v1/sync"
    }
  },
  "features": {
    "mobile_sync": true,
    "device_management": true,
    "push_notifications": false,
    "biometric_auth": true
  },
  "mobile": {
    "min_app_version": "1.0.0",
    "session_timeout_minutes": 15,
    "max_devices_per_user": 10
  }
}
```

### Well-Known Configuration

Standard discovery endpoint for automatic configuration.

```http
GET /.well-known/tradetally-config.json
```

---

## [SECURE] Authentication

### Login with Device Registration

Enhanced login that registers the device for multi-device management.

```http
POST /api/v1/auth/login/device
```

**Request:**
```json
{
  "email": "user@example.com",
  "password": "securepassword",
  "deviceInfo": {
    "name": "iPhone 15 Pro",
    "type": "ios",
    "model": "iPhone16,1",
    "fingerprint": "sha256_device_hash",
    "platformVersion": "17.1",
    "appVersion": "1.0.0"
  }
}
```

**Response:**
```json
{
  "message": "Login successful",
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "fullName": "John Doe",
    "role": "user"
  },
  "device": {
    "id": "device-uuid",
    "name": "iPhone 15 Pro",
    "type": "ios",
    "isTrusted": true
  },
  "tokens": {
    "accessToken": "jwt_access_token",
    "refreshToken": "refresh_token_string",
    "expiresIn": 900,
    "tokenType": "Bearer"
  }
}
```

### Refresh Access Token

Obtain a new access token using the refresh token.

```http
POST /api/v1/auth/refresh
Headers: X-Device-ID: {device_uuid}
```

**Request:**
```json
{
  "refreshToken": "current_refresh_token"
}
```

**Response:**
```json
{
  "message": "Token refreshed successfully",
  "tokens": {
    "accessToken": "new_jwt_access_token",
    "refreshToken": "new_refresh_token",
    "expiresIn": 900,
    "tokenType": "Bearer"
  }
}
```

### Enhanced Logout Options

#### Logout Current Session
```http
POST /api/v1/auth/logout
```

#### Logout Specific Device
```http
POST /api/v1/auth/logout/device
Headers: X-Device-ID: {device_uuid}
```

#### Logout All Devices
```http
POST /api/v1/auth/logout/all-devices
```

---

## [MOBILE] Device Management

### List User Devices

Get all registered devices for the current user.

```http
GET /api/v1/devices
```

**Response:**
```json
{
  "devices": [
    {
      "id": "device-uuid",
      "name": "iPhone 15 Pro",
      "type": "ios",
      "model": "iPhone16,1",
      "isTrusted": true,
      "lastActive": "2024-01-15T10:30:00Z",
      "createdAt": "2024-01-01T00:00:00Z",
      "activeTokens": 1
    }
  ],
  "totalCount": 1,
  "maxDevices": 10
}
```

### Register New Device

```http
POST /api/v1/devices
```

**Request:**
```json
{
  "name": "iPad Pro",
  "type": "ios",
  "model": "iPad14,3",
  "fingerprint": "unique_device_hash",
  "platformVersion": "17.1",
  "appVersion": "1.0.0"
}
```

### Device Trust Management

#### Trust Device
```http
POST /api/v1/devices/{device_id}/trust
```

#### Untrust Device
```http
POST /api/v1/devices/{device_id}/untrust
```

#### Delete Device
```http
DELETE /api/v1/devices/{device_id}
```

### Current Device Operations

#### Update Current Device Info
```http
PUT /api/v1/devices/current/info
Headers: X-Device-ID: {device_uuid}
```

#### Update Push Token
```http
POST /api/v1/devices/current/push-token
Headers: X-Device-ID: {device_uuid}
```

**Request:**
```json
{
  "token": "fcm_or_apns_token",
  "platform": "fcm" // or "apns"
}
```

#### Record Heartbeat
```http
POST /api/v1/devices/current/heartbeat
Headers: X-Device-ID: {device_uuid}
```

---

## [SYNC] Sync Operations

### Full Sync

Download complete dataset for initial app setup.

```http
GET /api/v1/sync/full
```

**Response:**
```json
{
  "sync": {
    "version": 1,
    "timestamp": "2024-01-15T10:30:00Z",
    "data": {
      "trades": [],
      "journal_entries": [],
      "settings": {},
      "user_profile": {}
    },
    "metadata": {
      "total_records": 150,
      "sync_type": "full"
    }
  }
}
```

### Delta Sync

Get incremental changes since last sync.

```http
GET /api/v1/sync/delta?since_version=5
```

**Response:**
```json
{
  "sync": {
    "since_version": 5,
    "current_version": 8,
    "changes": [
      {
        "entity_type": "trade",
        "entity_id": "trade-uuid",
        "action": "update",
        "data": {
          "symbol": "AAPL",
          "quantity": 200
        }
      }
    ],
    "has_more": false
  }
}
```

### Upload Changes

Push local changes to server.

```http
POST /api/v1/sync/delta
```

**Request:**
```json
{
  "lastSyncVersion": 5,
  "changes": [
    {
      "entity_type": "trade",
      "entity_id": "local-uuid",
      "action": "create",
      "data": {
        "symbol": "TSLA",
        "quantity": 100,
        "entryPrice": 200.50
      }
    }
  ]
}
```

### Sync Status

Get current sync state and conflicts.

```http
GET /api/v1/sync/status
```

**Response:**
```json
{
  "status": {
    "last_sync": "2024-01-15T10:30:00Z",
    "sync_version": 8,
    "pending_uploads": 2,
    "pending_downloads": 0,
    "conflicts": 1,
    "sync_enabled": true
  }
}
```

### Conflict Resolution

Resolve sync conflicts between client and server data.

```http
POST /api/v1/sync/conflicts/resolve
```

**Request:**
```json
{
  "conflicts": [
    {
      "conflictId": "conflict-uuid",
      "resolution": "client", // "client", "server", or "merge"
      "mergedData": {} // Required only for "merge"
    }
  ]
}
```

---

## [ANALYTICS] Mobile-Optimized Data

### User Profile

Get enhanced profile with mobile-specific data.

```http
GET /api/v1/users/profile
```

**Response:**
```json
{
  "profile": {
    "id": "user-uuid",
    "email": "user@example.com",
    "username": "johndoe",
    "fullName": "John Doe",
    "timezone": "UTC",
    "createdAt": "2024-01-01T00:00:00Z"
  },
  "mobile": {
    "lastSyncAt": "2024-01-15T10:30:00Z",
    "syncEnabled": true,
    "notificationsEnabled": false
  }
}
```

### Mobile Analytics

Get dashboard data optimized for mobile display.

```http
GET /api/v1/analytics/mobile/summary
```

**Response:**
```json
{
  "summary": {
    "today": {
      "trades": 5,
      "pnl": 150.75,
      "winRate": 80
    },
    "week": {
      "trades": 25,
      "pnl": 892.50,
      "winRate": 75
    },
    "month": {
      "trades": 98,
      "pnl": 3420.80,
      "winRate": 72
    }
  }
}
```

### Mobile Charts

Get chart data optimized for mobile screens.

```http
GET /api/v1/analytics/mobile/charts?period=30d&type=pnl
```

### Quick Trade Summary

Get recent trades and quick stats.

```http
GET /api/v1/trades/summary/quick
```

### Recent Trades

Get latest trades with minimal data.

```http
GET /api/v1/trades/recent?limit=10
```

---

## [SETTINGS] Settings Management

### Mobile Settings

Get/update mobile-specific settings.

```http
GET /api/v1/settings/mobile
```

**Response:**
```json
{
  "mobile": {
    "syncEnabled": true,
    "backgroundSync": true,
    "syncInterval": 300,
    "notifications": {
      "enabled": false,
      "tradeClosed": false,
      "dailySummary": false
    },
    "display": {
      "theme": "light",
      "currency": "USD",
      "dateFormat": "MM/DD/YYYY"
    }
  }
}
```

```http
PUT /api/v1/settings/mobile
```

### Notification Settings

```http
GET /api/v1/settings/notifications
PUT /api/v1/settings/notifications
```

### Display Settings

```http
GET /api/v1/settings/display
PUT /api/v1/settings/display
```

---

## [SEARCH] Health & Monitoring

### API Health Check

Check if the API is ready for mobile apps.

```http
GET /api/v1/server/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "checks": {
    "database": "ok",
    "tables": "ok",
    "mobile_ready": true
  },
  "uptime": 86400
}
```

### Server Status

Get server statistics and performance.

```http
GET /api/v1/server/status
```

---

## [ERROR] Error Handling

### Common HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (invalid/expired token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate data)
- `429` - Too Many Requests (rate limited)
- `503` - Service Unavailable (maintenance)

### Error Response Format

```json
{
  "error": "Token expired",
  "code": "TOKEN_EXPIRED",
  "message": "Access token has expired. Please refresh your token.",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Token Expiry Handling

When you receive a `TOKEN_EXPIRED` error:

1. Use the refresh token to get a new access token
2. Retry the original request with the new token
3. If refresh fails, redirect to login

---

## [MOBILE] Mobile App Integration Guide

### 1. Server Discovery

```javascript
// Discover server configuration
const config = await fetch('https://server.com/.well-known/tradetally-config.json');
const serverInfo = await config.json();

// Configure app based on server capabilities
if (serverInfo.features.biometric_auth) {
  enableBiometricAuth();
}
```

### 2. Authentication Flow

```javascript
// Login with device registration
const loginResponse = await fetch('/api/v1/auth/login/device', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'password',
    deviceInfo: {
      name: await getDeviceName(),
      type: Platform.OS,
      fingerprint: await getDeviceFingerprint()
    }
  })
});

const { user, device, tokens } = await loginResponse.json();

// Store tokens securely
await SecureStore.setItemAsync('access_token', tokens.accessToken);
await SecureStore.setItemAsync('refresh_token', tokens.refreshToken);
await SecureStore.setItemAsync('device_id', device.id);
```

### 3. Automatic Token Refresh

```javascript
// Axios interceptor for automatic token refresh
api.interceptors.response.use(
  response => response,
  async error => {
    if (error.response?.status === 401 && error.response?.data?.code === 'TOKEN_EXPIRED') {
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      const deviceId = await SecureStore.getItemAsync('device_id');
      
      try {
        const refreshResponse = await axios.post('/api/v1/auth/refresh', 
          { refreshToken },
          { headers: { 'X-Device-ID': deviceId } }
        );
        
        const { tokens } = refreshResponse.data;
        await SecureStore.setItemAsync('access_token', tokens.accessToken);
        await SecureStore.setItemAsync('refresh_token', tokens.refreshToken);
        
        // Retry original request
        error.config.headers.Authorization = `Bearer ${tokens.accessToken}`;
        return axios.request(error.config);
      } catch (refreshError) {
        // Refresh failed, redirect to login
        await logout();
        navigate('/login');
      }
    }
    return Promise.reject(error);
  }
);
```

### 4. Sync Implementation

```javascript
// Full sync on app startup
async function performFullSync() {
  const response = await api.get('/api/v1/sync/full');
  const { data } = response.data.sync;
  
  // Store data locally
  await localDB.replaceAll('trades', data.trades);
  await localDB.replaceAll('settings', data.settings);
  await storage.setItem('sync_version', response.data.sync.version);
}

// Delta sync for incremental updates
async function performDeltaSync() {
  const lastVersion = await storage.getItem('sync_version') || 0;
  const response = await api.get(`/api/v1/sync/delta?since_version=${lastVersion}`);
  
  const { changes, current_version } = response.data.sync;
  
  // Apply changes locally
  for (const change of changes) {
    if (change.action === 'create') {
      await localDB.insert(change.entity_type, change.data);
    } else if (change.action === 'update') {
      await localDB.update(change.entity_type, change.entity_id, change.data);
    } else if (change.action === 'delete') {
      await localDB.delete(change.entity_type, change.entity_id);
    }
  }
  
  await storage.setItem('sync_version', current_version);
}
```

### 5. Device Management

```javascript
// Record periodic heartbeat
setInterval(async () => {
  try {
    await api.post('/api/v1/devices/current/heartbeat');
  } catch (error) {
    console.warn('Heartbeat failed:', error);
  }
}, 5 * 60 * 1000); // Every 5 minutes

// Update push token when it changes
async function updatePushToken(newToken) {
  await api.post('/api/v1/devices/current/push-token', {
    token: newToken,
    platform: Platform.OS === 'ios' ? 'apns' : 'fcm'
  });
}
```

---

## [TOOLS] Development & Testing

### Testing Endpoints

Use these endpoints to test your mobile app integration:

1. **Server Discovery**: `GET /.well-known/tradetally-config.json`
2. **Health Check**: `GET /api/v1/server/health`
3. **Authentication**: `POST /api/v1/auth/login/device`
4. **Token Refresh**: `POST /api/v1/auth/refresh`

### Development Tools

- **Postman Collection**: Available for all endpoints
- **OpenAPI Spec**: `GET /api/v1/server/openapi.json`
- **CORS Testing**: Supports localhost for development

### Rate Limits

- **Default**: 1000 requests per 15 minutes per IP
- **Authentication**: No additional limits
- **Sync Operations**: Optimized for mobile usage patterns

---

## [DOCS] Additional Resources

- **Migration Guide**: See `MOBILE_MIGRATION.md` for upgrading existing deployments
- **Server Setup**: See `README.md` for server configuration
- **Environment Variables**: See `.env.example` for complete configuration options

For support and updates, visit the TradeTally documentation or GitHub repository.