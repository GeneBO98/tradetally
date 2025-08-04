-- Migration: Remove duplicate trades
-- This migration removes duplicate trades based on symbol, side, entry_price, exit_price, and pnl
-- It keeps the oldest trade (by created_at) for each set of duplicates

BEGIN;

-- Create a temporary table to identify duplicates
CREATE TEMP TABLE duplicate_trades AS
WITH ranked_trades AS (
  SELECT 
    id,
    user_id,
    symbol,
    side,
    entry_price,
    COALESCE(exit_price, 0) as exit_price_normalized,
    COALESCE(pnl, 0) as pnl_normalized,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY 
        user_id,
        symbol,
        side,
        ROUND(entry_price::numeric, 2),
        ROUND(COALESCE(exit_price, 0)::numeric, 2),
        ROUND(COALESCE(pnl, 0)::numeric, 2)
      ORDER BY created_at ASC
    ) as rn
  FROM trades
)
SELECT 
  id,
  user_id,
  symbol,
  side,
  entry_price,
  exit_price_normalized,
  pnl_normalized,
  created_at,
  rn
FROM ranked_trades
WHERE rn > 1; -- Only duplicates (keep the first one, rn=1)

-- Log what we're about to delete
DO $$
DECLARE
  duplicate_count INTEGER;
  total_trades INTEGER;
BEGIN
  SELECT COUNT(*) INTO duplicate_count FROM duplicate_trades;
  SELECT COUNT(*) INTO total_trades FROM trades;
  
  RAISE NOTICE 'Found % duplicate trades out of % total trades', duplicate_count, total_trades;
  RAISE NOTICE 'This migration will delete % trades and keep the oldest copy of each duplicate set', duplicate_count;
END $$;

-- Delete the duplicate trades (keeping the oldest one for each group)
DELETE FROM trades 
WHERE id IN (SELECT id FROM duplicate_trades);

-- Log the results
DO $$
DECLARE
  final_count INTEGER;
  deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO final_count FROM trades;
  SELECT COUNT(*) INTO deleted_count FROM duplicate_trades;
  
  RAISE NOTICE 'Migration completed successfully';
  RAISE NOTICE 'Deleted % duplicate trades', deleted_count;
  RAISE NOTICE 'Remaining trades: %', final_count;
END $$;

-- Clean up
DROP TABLE duplicate_trades;

COMMIT;