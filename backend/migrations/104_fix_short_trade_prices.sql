-- Fix swapped entry_price and exit_price for short trades
-- For short trades: SELL = entry, BUY = exit
-- But the system was storing BUY prices as entry and SELL prices as exit

-- Use a CTE to calculate the corrected values, then update
WITH corrections AS (
  SELECT
    id,
    exit_price as new_entry,  -- Swap: old exit becomes new entry
    entry_price as new_exit,  -- Swap: old entry becomes new exit
    (exit_price - entry_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0) as new_pnl,
    CASE
      WHEN exit_price != 0 AND quantity != 0 THEN
        ((exit_price - entry_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0)) / NULLIF(exit_price * quantity, 0) * 100
      ELSE
        0
    END as new_pnl_percent
  FROM trades
  WHERE side = 'short'
    AND entry_price IS NOT NULL
    AND exit_price IS NOT NULL
    AND exit_price != entry_price
    AND quantity IS NOT NULL
    AND quantity != 0
)
UPDATE trades t
SET
  entry_price = c.new_entry,
  exit_price = c.new_exit,
  pnl = c.new_pnl,
  pnl_percent = c.new_pnl_percent
FROM corrections c
WHERE t.id = c.id;
