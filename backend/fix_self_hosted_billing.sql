-- URGENT FIX: Self-Hosted Billing Issue
-- Run this script to diagnose and fix billing/user issues
-- Usage: docker-compose exec postgres psql -U trader -d tradetally -f /path/to/this/file.sql

-- ============================================
-- DIAGNOSTIC SECTION
-- ============================================

\echo '======================================'
\echo 'DIAGNOSTIC: Current System State'
\echo '======================================'

\echo ''
\echo '1. Checking instance_config for billing settings...'
SELECT key, value FROM instance_config WHERE key = 'billing_enabled';

\echo ''
\echo '2. Checking user roles and tiers...'
SELECT
  id,
  email,
  username,
  role,
  tier,
  created_at,
  is_active
FROM users
ORDER BY created_at
LIMIT 10;

\echo ''
\echo '3. Counting trades by user...'
SELECT
  u.email,
  u.username,
  u.role,
  u.tier,
  COUNT(t.id) as trade_count
FROM users u
LEFT JOIN trades t ON u.id = t.user_id
WHERE u.is_active = true
GROUP BY u.id, u.email, u.username, u.role, u.tier
ORDER BY u.created_at;

\echo ''
\echo '======================================'
\echo 'FIX: Applying corrections'
\echo '======================================'

-- ============================================
-- FIX SECTION
-- ============================================

-- 1. Disable billing in database
\echo ''
\echo '1. Disabling billing in database...'
INSERT INTO instance_config (key, value, created_at, updated_at)
VALUES ('billing_enabled', 'false', NOW(), NOW())
ON CONFLICT (key)
DO UPDATE SET
  value = 'false',
  updated_at = NOW();

-- 2. Set all users to Pro tier
\echo '2. Setting all users to Pro tier...'
UPDATE users
SET tier = 'pro'
WHERE tier != 'pro' OR tier IS NULL;

-- Get the count of updated users
SELECT COUNT(*) || ' users updated to Pro tier' as result
FROM users
WHERE tier = 'pro';

-- 3. Make the first user an admin
\echo ''
\echo '3. Making first created user an admin...'
WITH first_user AS (
  SELECT id, email FROM users ORDER BY created_at LIMIT 1
)
UPDATE users
SET role = 'admin'
FROM first_user
WHERE users.id = first_user.id
RETURNING users.email || ' is now an admin' as result;

-- ============================================
-- VERIFICATION SECTION
-- ============================================

\echo ''
\echo '======================================'
\echo 'VERIFICATION: Post-Fix State'
\echo '======================================'

\echo ''
\echo '1. Billing configuration:'
SELECT key, value FROM instance_config WHERE key = 'billing_enabled';

\echo ''
\echo '2. Admin users:'
SELECT email, username, role, tier FROM users WHERE role = 'admin';

\echo ''
\echo '3. User tier distribution:'
SELECT
  tier,
  COUNT(*) as user_count
FROM users
WHERE is_active = true
GROUP BY tier;

\echo ''
\echo '4. Recent trades (verifying data exists):'
SELECT
  u.username,
  t.symbol,
  t.entry_date::date as trade_date,
  t.pnl,
  t.side
FROM trades t
JOIN users u ON t.user_id = u.id
ORDER BY t.created_at DESC
LIMIT 5;

\echo ''
\echo '======================================'
\echo 'FIX COMPLETE!'
\echo '======================================'
\echo ''
\echo 'Next steps:'
\echo '1. Restart Docker containers: docker-compose restart app'
\echo '2. Clear browser cache or use incognito mode'
\echo '3. Log in and verify you can access Pro features'
\echo '4. Check that all your trades are visible'
\echo ''
\echo 'If issues persist, check:'
\echo '- Environment variables: docker-compose exec app env | grep BILLING'
\echo '- Application logs: docker-compose logs app --tail 50'
\echo ''
