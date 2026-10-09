-- Repair closed option trades saved with a literal zero exit price whose P&L
-- was left NULL by the manual trade form. Zero is a valid closing premium for
-- options that expire worthless.

WITH calculated AS (
  SELECT
    id,
    (
      CASE
        WHEN side = 'short' THEN entry_price - exit_price
        ELSE exit_price - entry_price
      END
      * ABS(quantity)
      * COALESCE(NULLIF(contract_size, 0), 100)
      - COALESCE(commission, 0)
      - COALESCE(fees, 0)
    ) AS new_pnl,
    entry_price
      * ABS(quantity)
      * COALESCE(NULLIF(contract_size, 0), 100) AS opening_notional
  FROM trades
  WHERE instrument_type = 'option'
    AND exit_time IS NOT NULL
    AND exit_price = 0
    AND pnl IS NULL
    AND entry_price IS NOT NULL
    AND entry_price > 0
    AND quantity IS NOT NULL
    AND ABS(quantity) > 0
)
UPDATE trades t
SET
  pnl = c.new_pnl,
  pnl_percent = CASE
    WHEN c.opening_notional > 0
      AND ABS((c.new_pnl / c.opening_notional) * 100) <= 999999
      THEN (c.new_pnl / c.opening_notional) * 100
    ELSE NULL
  END,
  updated_at = NOW()
FROM calculated c
WHERE t.id = c.id
  AND ABS(c.new_pnl) <= 99999999;

DELETE FROM analytics_cache;
