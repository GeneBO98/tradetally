-- Fix swapped entry_price and exit_price for short trades
-- For short trades: SELL = entry, BUY = exit
-- But the system was storing BUY prices as entry and SELL prices as exit

BEGIN;

-- Create a temporary table to store the corrections
CREATE TEMP TABLE short_trade_corrections AS
SELECT
  id,
  entry_price as old_entry,
  exit_price as old_exit,
  exit_price as new_entry,  -- Swap: old exit becomes new entry
  entry_price as new_exit,  -- Swap: old entry becomes new exit
  pnl as old_pnl,
  -- Recalculate P&L correctly for short trades
  -- For short: P/L = (entry - exit) * quantity - fees
  (exit_price - entry_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0) as new_pnl
FROM trades
WHERE side = 'short'
  AND entry_price IS NOT NULL
  AND exit_price IS NOT NULL
  AND exit_price != entry_price;  -- Only fix trades where prices are different

-- Show a sample of what will be fixed
SELECT
  id,
  old_entry,
  old_exit,
  new_entry,
  new_exit,
  old_pnl,
  new_pnl,
  new_pnl - old_pnl as pnl_difference
FROM short_trade_corrections
LIMIT 10;

-- Prompt user before proceeding
-- \echo 'Review the sample above. Press Ctrl+C to cancel, or press Enter to continue...'
-- \prompt 'Type YES to proceed with fixing all short trades: ' confirm

-- Update the trades with corrected values
UPDATE trades t
SET
  entry_price = c.new_entry,
  exit_price = c.new_exit,
  pnl = c.new_pnl,
  pnl_percent = (c.new_pnl / (c.new_entry * quantity)) * 100
FROM short_trade_corrections c
WHERE t.id = c.id;

-- Show summary of changes
SELECT
  COUNT(*) as trades_fixed,
  SUM(old_pnl) as old_total_pnl,
  SUM(new_pnl) as new_total_pnl,
  SUM(new_pnl - old_pnl) as total_pnl_difference
FROM short_trade_corrections;

COMMIT;

-- Log the migration
INSERT INTO schema_migrations (version, name, executed_at)
VALUES (102, 'fix_short_trade_prices', NOW())
ON CONFLICT (version) DO NOTHING;
