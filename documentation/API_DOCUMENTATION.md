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

### Trade Images (v1)

Upload chart screenshots directly to an existing trade with an API key:

```bash
curl -X POST "https://your-instance.example/api/v1/trades/TRADE_ID/images" \
  -H "X-API-Key: $TRADETALLY_API_KEY" \
  -F "images=@entry.png" \
  -F "images=@exit.png"
```

`Authorization: Bearer <api_key>` is also accepted. Uploads and deletion require
`trades:write`; downloads and trade retrieval require `trades:read`. JWT sessions
continue to work. API keys follow the existing Pro/self-hosted access rules.

Use the multipart field `images` once per file. The web upload limits also apply:
1–10 JPEG, PNG or WebP files per request, at most 50 MiB per file, and dimensions
up to 10000×10000 pixels. Images are compressed to WebP without resizing, stored
as trade attachments, and displayed automatically in the web interface.

Successful uploads return HTTP 200:

```json
{
  "message": "Images processed successfully",
  "images": [{
    "id": "attachment-uuid",
    "trade_id": "trade-uuid",
    "file_url": "/api/trades/trade-uuid/images/stored-filename.webp",
    "file_type": "image/webp",
    "file_name": "entry.png",
    "file_size": 24576,
    "uploaded_at": "2026-11-07T12:00:00Z",
    "original_size": 49152,
    "compressed_size": 24576,
    "compression_ratio": 50
  }],
  "total_images": 1,
  "successful_uploads": 1
}
```

- `GET /api/v1/trades/{id}` includes stored image references in `trade.attachments`.
- Download the returned `file_url` with your API key header. The equivalent
  `GET /api/v1/trades/{id}/images/{filename}` route also accepts API keys.
- `DELETE /api/v1/trades/{id}/images/{attachment_id}` removes the attachment and
  stored file. Use the attachment's `id`, rather than its filename.
- Only the owner can upload or delete images. Private image downloads also
  require ownership; existing public image URLs remain publicly viewable.

With partial success, HTTP 200 includes both attachments and failed entries of
the form `{ "filename": "bad.png", "error": "..." }`. Inspect
`successful_uploads` and retry only failed images. If no images can be processed,
HTTP 422 returns `error.code: "IMAGE_UPLOAD_FAILED"` and the failures in
`error.details.images`. Missing files and unsupported types return 400; files
over 50 MiB return 413. Repeating an upload creates new attachments; image uploads
do not support `Idempotency-Key`.

### Chart Links (v1)

`POST /api/v1/trades/{id}/charts` accepts API keys with `trades:write`:

```json
{
  "chart_url": "https://www.tradingview.com/x/example/",
  "chart_title": "Entry setup"
}
```

The URL must use HTTP or HTTPS, contain no embedded credentials, and be at most
1000 characters. The optional title accepts at most 255 characters. HTTP 201
returns `{ "message": "Chart added successfully", "chart": { ... } }` with
snake_case chart fields. Call repeatedly to attach several links; fetching the
trade returns them in `trade.charts`.

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

### MAE/MFE units

Trade creation and updates (including `/api/v1/trades` and bulk requests) accept
`excursion_unit`: `dollars` (default), `points`, or `r`. It applies only to the
excursion values supplied in that request: `mae`, `mfe`, `post_exit_mae`, and
`post_exit_mfe`. Legacy `postExitMae` / `postExitMfe` names remain supported.

- `dollars`: position-wide monetary amounts in the trade's stored currency.
- `points`: price movement per share or contract. Monetary amount = points ×
  quantity × instrument multiplier (futures point value, option contract size,
  or 1 for shares).
- `r`: excursion divided by positive risk to the current stop. Monetary amount =
  R × stop distance × quantity × instrument multiplier. The stop must be below
  entry for longs and above entry for shorts. Missing or invalid risk returns 400.

For example, updating a 3-contract MES long entered at 6000 with a stop at 5998
and a $5 point value:

```json
{
  "excursion_unit": "r",
  "mae": 0.5,
  "mfe": 4,
  "post_exit_mfe": 5
}
```

This saves MAE 15, MFE 120, and after-trade MFE 150 in currency units. The same
in-trade values can be entered as 1 and 8 points. Omitting an excursion preserves
it on update; `null` clears it and zero is a recorded value. Unit selection does
not change P&L or stored risk settings. Excursions measure price movement before
commissions and fees, consistent with MAE/MFE analytics.

Stored values and create/update responses remain monetary amounts. Trade list
and detail responses additionally include `mae_points`, `mfe_points`, `mae_r`,
`mfe_r`, and corresponding `post_exit_*_points` / `post_exit_*_r` values. These
point and R values are independent of the selected display currency; unavailable
values are `null`. Raw edit responses return the stored monetary values.

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
