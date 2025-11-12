# URGENT: Self-Hosted Billing Issue - Fix Guide

## Problem
After pulling a new Docker image, self-hosted users are experiencing:
1. Stuck behind paywalls/subscription prompts
2. User shows as "not admin"
3. Trades may appear to be missing
4. Pro features are locked even with `BILLING_ENABLED=false`

## Root Cause
Two critical bugs were preventing `BILLING_ENABLED=false` from working properly:

1. **Backend Bug**: `tierService.js` was checking environment variables LAST instead of FIRST, and had flawed logic that kept billing enabled for localhost
2. **Frontend Bug**: Router guard was checking user tier without first checking if billing was disabled

## Fix Applied (in latest code)
The following files have been fixed:
- `backend/src/services/tierService.js` - Now checks `BILLING_ENABLED` env var FIRST
- `frontend/src/router/index.js` - Now skips tier checks when billing is disabled

## How to Apply the Fix

### Option 1: Pull Latest Image (RECOMMENDED)
```bash
# Pull the latest image with the fix
docker-compose pull

# Restart containers
docker-compose down
docker-compose up -d
```

### Option 2: Verify Your Configuration
1. Check your `.env` file has:
```bash
BILLING_ENABLED=false
FEATURES_BILLING_ENABLED=false
```

2. Check your `docker-compose.yaml` has these environment variables:
```yaml
environment:
  BILLING_ENABLED: ${BILLING_ENABLED:-false}
  FEATURES_BILLING_ENABLED: ${FEATURES_BILLING_ENABLED:-false}
```

3. Restart Docker containers:
```bash
docker-compose down
docker-compose up -d
```

4. Clear browser cache or use incognito mode to test

### Option 3: Database-Level Fix (If still having issues)

Connect to your database and run these commands:

```sql
-- 1. Check current user roles and tiers
SELECT id, email, username, role, tier, created_at FROM users ORDER BY created_at;

-- 2. Make the first user an admin (replace 'your-email@example.com' with actual email)
UPDATE users
SET role = 'admin', tier = 'pro'
WHERE email = 'your-email@example.com';

-- 3. Set all users to pro tier (optional - only if billing is definitely disabled)
UPDATE users SET tier = 'pro';

-- 4. Verify billing is disabled in database
SELECT * FROM instance_config WHERE key = 'billing_enabled';

-- 5. If billing is enabled in database, disable it:
UPDATE instance_config
SET value = 'false'
WHERE key = 'billing_enabled';
-- Or insert if it doesn't exist:
INSERT INTO instance_config (key, value)
VALUES ('billing_enabled', 'false')
ON CONFLICT (key) DO UPDATE SET value = 'false';
```

## Troubleshooting: "Trades Disappeared"

If your trades are missing after update:

### 1. Check if trades exist in database:
```sql
-- Count trades by user
SELECT user_id, COUNT(*) as trade_count
FROM trades
GROUP BY user_id;

-- Show recent trades
SELECT id, user_id, symbol, entry_date, pnl
FROM trades
ORDER BY created_at DESC
LIMIT 10;
```

### 2. Check your current user ID:
Log into the app, open browser console, and run:
```javascript
console.log(localStorage.getItem('user'))
```

Look for the `id` field - this is your user ID.

### 3. Verify trades are linked to your user:
```sql
-- Replace 'YOUR_USER_ID' with actual UUID from step 2
SELECT COUNT(*) FROM trades WHERE user_id = 'YOUR_USER_ID';
```

### 4. If trades exist but aren't showing:
- Clear browser cache completely
- Try incognito/private browser window
- Check browser console for errors (F12 -> Console tab)
- Check Docker logs: `docker-compose logs app --tail 50`

## Verification Steps

After applying the fix, verify it worked:

1. **Check Backend Logs**:
```bash
docker-compose logs app | grep -i billing
```

You should see:
```
[BILLING] Environment variable check: BILLING_ENABLED=false, returning: false
[BILLING] Disabled for host: <your-host> (not tradetally.io)
```

2. **Check Frontend Console**:
Open browser DevTools (F12), go to Console tab, and you should see:
```
[BILLING] Enabled: false
[ROUTER] Billing disabled - skipping tier check for <route-name>
```

3. **Test Access**:
- Try accessing `/analytics/behavioral` (Pro feature)
- Try accessing `/markets` (Pro feature)
- You should NOT be redirected to pricing page

## Still Having Issues?

### Quick Checklist:
- [ ] `.env` file has `BILLING_ENABLED=false`
- [ ] `docker-compose.yaml` passes environment variables correctly
- [ ] Restarted Docker containers after changes (`docker-compose down && docker-compose up -d`)
- [ ] Cleared browser cache / tried incognito mode
- [ ] User role is set to 'admin' or 'user' (not null)
- [ ] User tier is set to 'pro' (in database)

### Advanced Debugging:

**Check if environment variable is reaching the container:**
```bash
docker-compose exec app env | grep BILLING
```

Should show:
```
BILLING_ENABLED=false
FEATURES_BILLING_ENABLED=false
```

**Check database directly:**
```bash
docker-compose exec postgres psql -U trader -d tradetally -c "SELECT * FROM users WHERE role = 'admin';"
```

**Force rebuild if needed:**
```bash
docker-compose down -v  # WARNING: This removes volumes!
docker-compose pull
docker-compose up -d
```

## Prevention

To prevent this issue in the future:

1. **Always set in `.env`**:
```bash
BILLING_ENABLED=false
FEATURES_BILLING_ENABLED=false
```

2. **Document in your deployment**:
Add a comment in your `.env` file:
```bash
# CRITICAL: For self-hosted, keep BILLING_ENABLED=false
# This ensures all users get Pro features without subscriptions
```

3. **Monitor logs after updates**:
After pulling new images, check logs for billing-related messages:
```bash
docker-compose logs app | grep -i "\[BILLING\]"
```

## Contact

If you're still experiencing issues after following this guide:
1. Check GitHub issues: https://github.com/GeneBO98/tradetally/issues
2. Include in your report:
   - Output of `docker-compose exec app env | grep BILLING`
   - Output of `docker-compose logs app --tail 100`
   - Screenshot of browser console (F12)
   - Database query results from troubleshooting section

---
**Last Updated**: 2025-10-30
**Affects**: Self-hosted instances after image pull
**Fixed In**: Version with updated tierService.js and router/index.js
