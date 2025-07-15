# TradeTally API Documentation

## Authentication

TradeTally supports two authentication methods:

### 1. JWT Token Authentication (Web UI)
```
Authorization: Bearer <jwt_token>
```

### 2. API Key Authentication (Programmatic Access)
```
Authorization: Bearer <api_key>
```
or
```
X-API-Key: <api_key>
```

API keys have the format: `tt_live_<random_string>`

## API Key Management

### Create API Key
```
POST /api/api-keys
```

**Request Body:**
```json
{
  "name": "My API Key",
  "permissions": ["read", "write"],
  "expiresIn": 90
}
```

**Response:**
```json
{
  "message": "API key created successfully",
  "apiKey": {
    "id": "uuid",
    "name": "My API Key",
    "key": "tt_live_<key>",
    "keyPrefix": "tt_live_",
    "permissions": ["read", "write"],
    "expiresAt": "2024-04-15T00:00:00.000Z",
    "isActive": true,
    "createdAt": "2024-01-15T00:00:00.000Z"
  }
}
```

### List API Keys
```
GET /api/api-keys
```

### Delete API Key
```
DELETE /api/api-keys/:keyId
```

## Trades API

### Get All Trades
```
GET /api/v2/trades
```

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)
- `symbol` (optional): Filter by symbol
- `startDate` (optional): Filter trades after date (YYYY-MM-DD)
- `endDate` (optional): Filter trades before date (YYYY-MM-DD)

**Response:**
```json
{
  "trades": [
    {
      "id": "uuid",
      "symbol": "AAPL",
      "side": "long",
      "entryTime": "2024-01-15T09:30:00.000Z",
      "exitTime": "2024-01-15T15:30:00.000Z",
      "entryPrice": 150.25,
      "exitPrice": 152.50,
      "quantity": 100,
      "pnl": 225.00,
      "pnlPercent": 1.50,
      "commission": 2.00,
      "fees": 0.50,
      "notes": "Earnings play",
      "isPublic": false,
      "createdAt": "2024-01-15T09:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 125,
    "pages": 3
  }
}
```

### Get Single Trade
```
GET /api/v2/trades/:id
```

### Create Trade
```
POST /api/v2/trades
```

**Request Body:**
```json
{
  "symbol": "AAPL",
  "side": "long",
  "entryTime": "2024-01-15T09:30:00.000Z",
  "exitTime": "2024-01-15T15:30:00.000Z",
  "entryPrice": 150.25,
  "exitPrice": 152.50,
  "quantity": 100,
  "commission": 2.00,
  "fees": 0.50,
  "notes": "Earnings play",
  "isPublic": false,
  "broker": "ThinkorSwim",
  "strategy": "Momentum",
  "setup": "Breakout",
  "tags": ["earnings", "tech"]
}
```

### Update Trade
```
PUT /api/v2/trades/:id
```

**Request Body:** (Same as create, all fields optional)

### Delete Trade
```
DELETE /api/v2/trades/:id
```

## Analytics API

### Overview
```
GET /api/v2/analytics/overview
```

**Response:**
```json
{
  "totalTrades": 125,
  "totalPnl": 12500.00,
  "winRate": 65.5,
  "profitFactor": 1.85,
  "avgWin": 250.00,
  "avgLoss": -150.00,
  "largestWin": 1500.00,
  "largestLoss": -800.00,
  "totalCommission": 250.00,
  "totalFees": 62.50,
  "avgHoldTime": "2h 30m",
  "sharpeRatio": 1.42,
  "maxDrawdown": -2500.00,
  "maxDrawdownPercent": -15.2,
  "currentStreak": 3,
  "longestWinStreak": 8,
  "longestLossStreak": 4
}
```

### Performance Metrics
```
GET /api/v2/analytics/performance
```

**Query Parameters:**
- `period` (optional): day, week, month, year (default: month)
- `startDate` (optional): Start date filter
- `endDate` (optional): End date filter

### Calendar Data
```
GET /api/v2/analytics/calendar
```

**Response:**
```json
{
  "2024-01-15": {
    "date": "2024-01-15",
    "pnl": 500.00,
    "trades": 5,
    "winRate": 80.0,
    "volume": 1500
  }
}
```

### Symbol Statistics
```
GET /api/v2/analytics/symbols
```

**Response:**
```json
{
  "symbols": [
    {
      "symbol": "AAPL",
      "trades": 15,
      "pnl": 2500.00,
      "winRate": 73.3,
      "avgPnl": 166.67,
      "volume": 1500
    }
  ]
}
```

### Chart Data
```
GET /api/v2/analytics/charts
```

**Query Parameters:**
- `type`: equity, pnl, winrate, volume
- `period`: day, week, month, year

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Additional details"
}
```

### Common Error Codes:
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (invalid/missing API key)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `429` - Rate Limited
- `500` - Internal Server Error

## Rate Limiting

API requests are rate limited to:
- 1000 requests per 15 minutes per API key
- Import endpoints have separate, higher limits

## API Key Permissions

### `read`
- View trades and analytics
- Access all GET endpoints

### `write`
- Create, update, and delete trades
- Access all endpoints except admin functions

### `admin`
- Full access to all endpoints
- User management functions
- Only available to admin users

## Examples

### JavaScript/Node.js
```javascript
const apiKey = 'tt_live_your_api_key';
const baseUrl = 'https://your-domain.com/api/v2';

// Get trades
const trades = await fetch(`${baseUrl}/trades`, {
  headers: {
    'Authorization': `Bearer ${apiKey}`
  }
}).then(r => r.json());

// Create trade
const newTrade = await fetch(`${baseUrl}/trades`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    symbol: 'AAPL',
    side: 'long',
    entryTime: '2024-01-15T09:30:00.000Z',
    entryPrice: 150.25,
    quantity: 100
  })
}).then(r => r.json());
```

### Python
```python
import requests

api_key = 'tt_live_your_api_key'
base_url = 'https://your-domain.com/api/v2'

headers = {
    'Authorization': f'Bearer {api_key}',
    'Content-Type': 'application/json'
}

# Get trades
response = requests.get(f'{base_url}/trades', headers=headers)
trades = response.json()

# Create trade
trade_data = {
    'symbol': 'AAPL',
    'side': 'long',
    'entryTime': '2024-01-15T09:30:00.000Z',
    'entryPrice': 150.25,
    'quantity': 100
}

response = requests.post(f'{base_url}/trades', json=trade_data, headers=headers)
new_trade = response.json()
```

### cURL
```bash
# Get trades
curl -H "Authorization: Bearer tt_live_your_api_key" \
     https://your-domain.com/api/v2/trades

# Create trade
curl -X POST \
     -H "Authorization: Bearer tt_live_your_api_key" \
     -H "Content-Type: application/json" \
     -d '{"symbol":"AAPL","side":"long","entryTime":"2024-01-15T09:30:00.000Z","entryPrice":150.25,"quantity":100}' \
     https://your-domain.com/api/v2/trades
```

## Support

For API support, please:
1. Check this documentation first
2. Review error messages and status codes
3. Verify your API key permissions
4. Contact support with specific error messages and request details

## Changelog

### v2.0.0
- Added API key authentication
- Introduced `/api/v2/` endpoints with flexible authentication
- Enhanced error handling and validation
- Added comprehensive analytics endpoints