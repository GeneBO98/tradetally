# TradeTally Mobile API - Quick Start Guide

## 🚀 Getting Started

### 1. Server Discovery

First, discover your TradeTally server configuration:

```bash
curl https://your-server.com/.well-known/tradetally-config.json
```

### 2. Login with Device Registration

```bash
curl -X POST https://your-server.com/api/v1/auth/login/device \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password",
    "deviceInfo": {
      "name": "iPhone 15",
      "type": "ios",
      "fingerprint": "device-hash"
    }
  }'
```

### 3. Make Authenticated Requests

```bash
curl https://your-server.com/api/v1/users/profile \
  -H "Authorization: Bearer {access_token}" \
  -H "X-Device-ID: {device_uuid}"
```

### 4. Refresh Tokens

```bash
curl -X POST https://your-server.com/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -H "X-Device-ID: {device_uuid}" \
  -d '{
    "refreshToken": "refresh_token_here"
  }'
```

## 📱 Mobile App Integration

### React Native Example

```javascript
// 1. Server Discovery
const discoverServer = async (serverUrl) => {
  const response = await fetch(`${serverUrl}/.well-known/tradetally-config.json`);
  return response.json();
};

// 2. Login with Device
const loginWithDevice = async (credentials, deviceInfo) => {
  const response = await fetch('/api/v1/auth/login/device', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...credentials,
      deviceInfo
    })
  });
  return response.json();
};

// 3. Authenticated API Client
const createApiClient = (baseUrl, getAccessToken, deviceId) => {
  return {
    get: async (endpoint) => {
      const token = await getAccessToken();
      return fetch(`${baseUrl}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-Device-ID': deviceId
        }
      });
    },
    // ... other methods
  };
};

// 4. Automatic Token Refresh
const refreshTokenIfNeeded = async (refreshToken, deviceId) => {
  const response = await fetch('/api/v1/auth/refresh', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Device-ID': deviceId
    },
    body: JSON.stringify({ refreshToken })
  });
  return response.json();
};
```

## 🔄 Sync Implementation

### Full Sync (Initial Load)

```javascript
const performFullSync = async () => {
  const response = await api.get('/api/v1/sync/full');
  const { data } = response.data.sync;
  
  // Store locally
  await localDB.replaceAll('trades', data.trades);
  await storage.setItem('sync_version', response.data.sync.version);
};
```

### Delta Sync (Incremental Updates)

```javascript
const performDeltaSync = async () => {
  const lastVersion = await storage.getItem('sync_version') || 0;
  const response = await api.get(`/api/v1/sync/delta?since_version=${lastVersion}`);
  
  // Apply changes
  for (const change of response.data.sync.changes) {
    await applyChange(change);
  }
  
  await storage.setItem('sync_version', response.data.sync.current_version);
};
```

## 📊 Key Endpoints

| Endpoint | Method | Purpose |
|----------|---------|----------|
| `/.well-known/tradetally-config.json` | GET | Server discovery |
| `/api/v1/server/info` | GET | Server information |
| `/api/v1/auth/login/device` | POST | Login with device |
| `/api/v1/auth/refresh` | POST | Refresh tokens |
| `/api/v1/devices` | GET | List devices |
| `/api/v1/sync/full` | GET | Full data sync |
| `/api/v1/sync/delta` | GET/POST | Incremental sync |
| `/api/v1/users/profile` | GET | User profile |
| `/api/v1/analytics/mobile/summary` | GET | Mobile analytics |

## 🔧 Configuration

### Environment Variables

```env
# CORS for mobile apps
CORS_ORIGINS=http://localhost:3000,capacitor://localhost

# Mobile token settings
ACCESS_TOKEN_EXPIRE=15m
REFRESH_TOKEN_EXPIRE=30d
MAX_DEVICES_PER_USER=10

# Instance info
INSTANCE_NAME=TradeTally
INSTANCE_URL=https://your-domain.com
```

### Docker Setup

Add to your `docker-compose.yaml`:

```yaml
environment:
  CORS_ORIGINS: ${CORS_ORIGINS:-}
  ACCESS_TOKEN_EXPIRE: ${ACCESS_TOKEN_EXPIRE:-15m}
  REFRESH_TOKEN_EXPIRE: ${REFRESH_TOKEN_EXPIRE:-30d}
  MAX_DEVICES_PER_USER: ${MAX_DEVICES_PER_USER:-10}
```

## 🛠️ Development Tools

### OpenAPI Specification

```bash
curl https://your-server.com/api/v1/server/openapi.json
```

### Health Check

```bash
curl https://your-server.com/api/v1/server/health
```

### Test Authentication

```bash
# Login
response=$(curl -s -X POST https://your-server.com/api/v1/auth/login/device \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password","deviceInfo":{"name":"Test","type":"web"}}')

# Extract tokens
access_token=$(echo $response | jq -r '.tokens.accessToken')
device_id=$(echo $response | jq -r '.device.id')

# Test authenticated request
curl https://your-server.com/api/v1/users/profile \
  -H "Authorization: Bearer $access_token" \
  -H "X-Device-ID: $device_id"
```

## 📚 Additional Resources

- **Full Documentation**: See `MOBILE_API.md`
- **Migration Guide**: See `MOBILE_MIGRATION.md` 
- **Server Setup**: See main `README.md`
- **OpenAPI Spec**: `GET /api/v1/server/openapi.json`

## 🎯 Next Steps

1. **Server Discovery**: Test `/.well-known/tradetally-config.json`
2. **Authentication**: Implement login with device registration
3. **Token Management**: Set up automatic refresh
4. **Data Sync**: Implement full and delta sync
5. **Offline Support**: Add local storage and queue

Happy coding! 🚀