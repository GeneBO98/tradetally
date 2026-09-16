-- Migration: Normalize trade amounts to true USD before aggregation
-- Created: 2026-09-15
-- Purpose: The import paths convert native-currency trades to USD
-- (convertTradeToUSD) but that is best-effort: manual/API/import trades can
-- retain their original currency in the primary amount columns (exchange_rate
-- stays 1/NULL and original_currency names the stored currency). Summing
-- mixed-currency amounts yields meaningless totals, so aggregate queries must
-- convert each row to USD *before* summing. trade_amount_usd() decides the
-- row's effective base currency from the stored metadata and divides native
-- amounts by today's USD-based FX snapshot (fx_daily_rates). If the rate is
-- unavailable it returns the amount unchanged (same approximation as before,
-- never NULL), so analytics keep working offline.
--
-- Base-currency rule (mirrored in utils/tradeFx.js):
--   converted (amount already USD) iff exchange_rate set to something != 1
--   OR original_*_currency columns populated; otherwise the amount is stored
--   in original_currency.

CREATE OR REPLACE FUNCTION trade_amount_usd(
  amount NUMERIC,
  orig_currency TEXT,
  exchange_rate NUMERIC,
  original_pnl_currency NUMERIC DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN amount IS NULL THEN NULL
    WHEN (exchange_rate IS NOT NULL AND exchange_rate > 0 AND exchange_rate <> 1)
      OR original_pnl_currency IS NOT NULL
      THEN amount
    WHEN orig_currency IS NULL OR orig_currency = '' OR UPPER(orig_currency) = 'USD'
      THEN amount
    ELSE COALESCE(
      amount / NULLIF(
        (SELECT (r.rates ->> UPPER(orig_currency))::numeric
           FROM fx_daily_rates r
          WHERE r.base_code = 'USD'
            AND r.rate_date = (SELECT MAX(rate_date) FROM fx_daily_rates WHERE base_code = 'USD')),
        0),
      amount)
  END
$$;

COMMENT ON FUNCTION trade_amount_usd IS 'Convert a trades-row amount to USD before aggregation; native amounts are divided by the latest stored USD-based rate for their original currency';

-- Aggregate semantics changed (mixed-currency sums are now normalized at the
-- base scan), so every cached USD aggregate is stale. The in-process caches
-- clear on restart; the persisted cache must be cleared here.
DELETE FROM analytics_cache;
