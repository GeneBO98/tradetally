-- Recalculate stored P&L percentages from net P&L.
--
-- The canonical P&L engine now defines pnl_percent as:
--   net pnl / opening notional * 100
--
-- Previously, stock and option percentages were based on gross entry/exit price
-- movement, while pnl included commissions, fees, and rebates. A gross winner
-- with large costs could therefore show negative P&L but a positive percentage.

WITH calculated AS (
  SELECT
    id,
    CASE
      WHEN denominator > 0 THEN (pnl / denominator) * 100
      ELSE NULL
    END AS new_pnl_percent
  FROM (
    SELECT
      id,
      pnl,
      entry_price * ABS(quantity) *
        CASE
          WHEN instrument_type = 'future' THEN COALESCE(NULLIF(point_value, 0), 1)
          WHEN instrument_type = 'option' THEN COALESCE(NULLIF(contract_size, 0), 100)
          ELSE 1
        END AS denominator
    FROM trades
    WHERE pnl IS NOT NULL
      AND entry_price IS NOT NULL
      AND entry_price > 0
      AND quantity IS NOT NULL
      AND ABS(quantity) > 0
  ) source
)
UPDATE trades t
SET pnl_percent = CASE
  WHEN c.new_pnl_percent IS NOT NULL AND ABS(c.new_pnl_percent) <= 999999
    THEN c.new_pnl_percent
  ELSE NULL
END
FROM calculated c
WHERE t.id = c.id
  AND t.pnl_percent IS DISTINCT FROM CASE
    WHEN c.new_pnl_percent IS NOT NULL AND ABS(c.new_pnl_percent) <= 999999
      THEN c.new_pnl_percent
    ELSE NULL
  END;

DELETE FROM analytics_cache;
