-- Migration: Remove duplicate trades
-- This migration removes duplicate trades based on symbol, side, entry_price, exit_price, and pnl
-- It keeps the oldest trade (by created_at) for each set of duplicates

-- Delete duplicates in a single statement using a CTE
DELETE FROM trades
WHERE id IN (
  WITH ranked_trades AS (
    SELECT
      id,
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
  SELECT id
  FROM ranked_trades
  WHERE rn > 1
);