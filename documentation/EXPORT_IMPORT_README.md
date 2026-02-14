# Data Export/Import Functionality

This document explains how to use TradeTally's data export and import features.

## Overview

TradeTally provides comprehensive data export and import functionality that allows users to:
- Export all their data as a JSON file
- Import data from previous TradeTally exports
- Migrate between different TradeTally instances (e.g., from tradetally.io to self-hosted)

## Features

### Export
- **Complete Data Export**: Exports all user data including trades, tags, settings, trading profile, and equity history
- **JSON Format**: Uses a structured JSON format for easy parsing and portability
- **Timestamped Files**: Files are automatically named with export date
- **Privacy Safe**: Only exports data belonging to the authenticated user

### Import
- **Duplicate Prevention**: Automatically prevents importing duplicate trades
- **Data Merging**: Merges imported data with existing data (doesn't overwrite)
- **Validation**: Validates import file format and structure
- **Atomic Operations**: Uses database transactions for data integrity

## Usage

### Exporting Data

1. **Via Web Interface**:
   - Go to Settings page
   - Scroll to "Data Export & Import" section
   - Click "Export All Data"
   - File will be downloaded as `tradetally-export-YYYY-MM-DD.json`

2. **Via API**:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        -o export.json \
        https://your-instance.com/api/settings/export
   ```

### Importing Data

1. **Via Web Interface**:
   - Go to Settings page
   - Scroll to "Data Export & Import" section
   - Click "Select Import File"
   - Choose your TradeTally export JSON file
   - Click "Import Data"

2. **Via API**:
   ```bash
   curl -X POST \
        -H "Authorization: Bearer YOUR_TOKEN" \
        -F "file=@tradetally-export-2025-07-14.json" \
        https://your-instance.com/api/settings/import
   ```

## Export Data Structure

The export file contains the following structure:

```json
{
  "exportVersion": "1.0",
  "exportDate": "2025-07-14T10:30:00.000Z",
  "user": {
    "username": "trader123",
    "fullName": "John Doe",
    "email": "john@example.com",
    "timezone": "America/New_York"
  },
  "settings": {
    "emailNotifications": true,
    "publicProfile": false,
    "defaultTags": ["momentum", "earnings"],
    "accountEquity": 50000.00
  },
  "tradingProfile": {
    "tradingStrategies": ["Breakouts", "Momentum Trading"],
    "tradingStyles": ["Day Trading", "Swing Trading"],
    "riskTolerance": "moderate",
    "primaryMarkets": ["US Stocks", "Options"],
    "experienceLevel": "intermediate",
    "averagePositionSize": "medium",
    "tradingGoals": ["Income Generation", "Capital Appreciation"],
    "preferredSectors": ["Technology", "Healthcare"]
  },
  "trades": [
    {
      "symbol": "AAPL",
      "side": "long",
      "quantity": 100,
      "entryPrice": 150.00,
      "exitPrice": 155.00,
      "entryTime": "2025-07-14T09:30:00.000Z",
      "exitTime": "2025-07-14T15:30:00.000Z",
      "pnl": 500.00,
      "commission": 2.00,
      "fees": 0.50,
      "notes": "Breakout trade on earnings",
      "tags": ["earnings", "breakout"],
      "isPublic": false,
      "strategy": "Breakout",
      "createdAt": "2025-07-14T09:30:00.000Z"
    }
  ],
  "tags": [
    {
      "name": "momentum",
      "color": "#3B82F6"
    }
  ],
  "equityHistory": [
    {
      "date": "2025-07-14",
      "equity": 50000.00,
      "pnl": 500.00
    }
  ]
}
```

## Database Requirements

The export/import functionality requires specific database tables and columns. Run the migration to ensure all required fields exist:

### For Development
```bash
cd backend
npm run migrate:export
```

### For Docker/Production
The migration runs automatically on container startup. To run manually:

```bash
# Inside the container
node scripts/run-export-migration.js

# Or via docker-compose
docker-compose exec backend node scripts/run-export-migration.js
```

## Migration Details

The `012_add_missing_export_fields.sql` migration adds:

- **User Table**: 2FA support, admin roles, approval system
- **User Settings**: Account equity, trading profile fields
- **Equity History**: Table for tracking equity over time
- **Indexes**: Performance optimization for array fields
- **Data Migration**: Converts existing equity_snapshots to equity_history

## Use Cases

### 1. Backup and Restore
```bash
# Export for backup
curl -H "Authorization: Bearer $TOKEN" -o backup.json $API_URL/settings/export

# Later, restore from backup
curl -X POST -H "Authorization: Bearer $TOKEN" -F "file=@backup.json" $API_URL/settings/import
```

### 2. Migration from Hosted to Self-Hosted
```bash
# 1. Export from tradetally.io
curl -H "Authorization: Bearer $HOSTED_TOKEN" -o migration.json https://tradetally.io/api/settings/export

# 2. Import to self-hosted instance
curl -X POST -H "Authorization: Bearer $SELF_TOKEN" -F "file=@migration.json" https://your-server.com/api/settings/import
```

### 3. Development/Testing
```bash
# Export production data
curl -H "Authorization: Bearer $PROD_TOKEN" -o prod_data.json $PROD_API/settings/export

# Import to development environment
curl -X POST -H "Authorization: Bearer $DEV_TOKEN" -F "file=@prod_data.json" $DEV_API/settings/import
```

## Error Handling

Common errors and solutions:

- **"No file uploaded"**: Ensure the file is attached to the request
- **"Invalid JSON file"**: Check that the file is valid JSON
- **"Invalid TradeTally export file"**: Ensure the file has the correct structure
- **"Database error"**: Run the migration to ensure all tables exist

## Security Considerations

- Export files contain sensitive trading data - store securely
- Only authenticated users can export their own data
- Import validates file format to prevent malicious uploads
- Database transactions ensure data integrity during import

## Performance

- Export performance depends on data size (trades, equity history)
- Import uses transactions for atomicity but may be slower for large datasets
- Consider running large imports during off-peak hours

## Support

For issues with export/import functionality:
1. Check that the migration has been run
2. Verify file format matches the expected structure
3. Check server logs for detailed error messages
4. Report issues with sample data (anonymized) for debugging