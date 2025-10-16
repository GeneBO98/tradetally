-- Fix timezone issue in trade_date field
-- This migration corrects trade dates that were incorrectly calculated due to timezone conversion
-- Trade dates should be based on when the trade actually occurred in the user's timezone,
-- not the UTC date after timezone conversion

-- First, let's identify and fix trades where trade_date doesn't match the actual trading day
-- Stock markets are closed on weekends, so any trade_date showing Saturday/Sunday is incorrect

UPDATE trades 
SET trade_date = DATE(
  CASE 
    WHEN exit_time IS NOT NULL THEN exit_time AT TIME ZONE 'UTC' AT TIME ZONE COALESCE((SELECT timezone FROM users WHERE users.id = trades.user_id), 'America/New_York')
    ELSE entry_time AT TIME ZONE 'UTC' AT TIME ZONE COALESCE((SELECT timezone FROM users WHERE users.id = trades.user_id), 'America/New_York')
  END
)
WHERE EXTRACT(DOW FROM trade_date) IN (0, 6) -- Only fix weekend dates
  AND EXTRACT(DOW FROM entry_time) NOT IN (0, 6); -- That have weekday entry times

-- Double-check: ensure no trades have weekend dates after the fix
-- This query should return 0 rows after the migration
DO $$
DECLARE
    weekend_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO weekend_count
    FROM trades
    WHERE EXTRACT(DOW FROM trade_date) IN (0, 6);

    RAISE NOTICE 'Migration 019 completed successfully';
    RAISE NOTICE 'Weekend trades remaining: %', weekend_count;
END $$;