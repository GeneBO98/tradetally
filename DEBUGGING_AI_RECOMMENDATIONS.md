# Debugging AI Recommendations Issue

The AI recommendations button spins on "analyzing" without showing results. Here's a step-by-step debugging guide:

## 1. Check if Database Columns Exist

First, ensure the trading profile columns were added to the database:

```bash
# Start the containers
cd /Users/brennonoverton/Projects/tradetally
docker compose up -d

# Check if trading profile columns exist
docker compose exec app psql -U trader -d tradetally -c "
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_settings' 
AND column_name LIKE '%trading%';
"
```

**If no columns are returned**, run the migration:
```bash
# Run the trading profile migration
docker compose exec app psql -U trader -d tradetally -f /app/backend/migrations/add_trading_profile_fields.sql
```

## 2. Test Gemini API Configuration

Test if the Gemini API key is working:

```bash
# Test Gemini API directly
docker compose exec app node /app/backend/test-gemini.js
```

**Expected output**: Should show "Hello from Gemini!" message
**If it fails**: Check your GEMINI_API_KEY in environment variables

## 3. Check Backend Logs

With enhanced logging added, check what happens when you click the AI button:

```bash
# Watch backend logs in real-time
docker compose logs -f app
```

Then click the AI Recommendations button and look for:
- 🤖 AI Recommendations request started
- ✅ Gemini API key is configured
- 📊 Fetching trade metrics...
- 👤 Fetching user trading profile...
- 🧠 Generating AI recommendations...

## 4. Check Frontend Browser Console

Open browser developer tools (F12) and watch the Console tab when clicking the AI button.

Look for:
- 🚀 Starting AI recommendations request...
- 📡 Making API call to: /analytics/recommendations
- ✅ API response received: [data]

**Or error messages like**:
- ❌ Error fetching recommendations
- Network errors
- 500 Internal Server Error

## 5. Manual API Test

You can test the API endpoint directly:

```bash
# Get your auth token from browser localStorage or login
# Then test the endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/analytics/recommendations
```

## 6. Common Issues and Solutions

### Issue: "Gemini API key not configured"
**Solution**: Add GEMINI_API_KEY to your .env file or docker-compose.yaml

### Issue: Database column errors
**Solution**: Run the trading profile migration (step 1)

### Issue: Network timeout
**Solution**: Gemini API might be slow - increase timeout or check internet connection

### Issue: "No trades found"
**Solution**: Import some trade data first before requesting recommendations

## 7. Quick Fix: Simplified Version

If the trading profile is causing issues, you can temporarily disable it by modifying the analytics controller:

```javascript
// In analytics.controller.js, line ~857, change:
tradingProfile = null; // Always set to null to bypass trading profile
```

This will make the AI recommendations work without the trading profile features.

## 8. Logs to Share

If none of the above works, please share:

1. **Backend logs** from step 3
2. **Frontend console logs** from step 4  
3. **Database column check** from step 1
4. **Gemini test result** from step 2

This will help identify exactly where the issue is occurring.