-- Migration: trade_amount_usd must trust only the pre-conversion columns
-- Created: 2026-09-15
-- The exchange_rate column is NOT a conversion marker: manual/API/OAuth
-- trades can carry a rate beside an unconverted price (same rule as
-- utils/openPositionGrouping.js storedCurrency()). Presence of the original
-- amount currency column (4th arg) is the only reliable "already converted
-- to USD" marker.

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
    -- converted at import: stored amount is already USD
    -- (original_pnl_currency receives whatever pre-conversion amount column
    --  the caller passes, e.g. original_entry_price_currency - any one of
    --  them proves the rewrite happened; exchange_rate does not)
    WHEN original_pnl_currency IS NOT NULL THEN amount
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

COMMENT ON FUNCTION trade_amount_usd IS 'Convert a trades-row amount to USD before aggregation; the original_*_currency column marks converted rows, native amounts divide by the latest stored USD-based rate';

-- Aggregates computed under the previous (exchange_rate-trusting) rule are stale
DELETE FROM analytics_cache;
