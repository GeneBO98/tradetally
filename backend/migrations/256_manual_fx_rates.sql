-- Server-wide administrator overrides. One USD buys rate units of quote_code.
CREATE TABLE IF NOT EXISTS manual_fx_rates (
  quote_code VARCHAR(3) PRIMARY KEY CHECK (quote_code ~ '^[A-Z]{3}$' AND quote_code <> 'USD'),
  per_usd NUMERIC(24, 10) NOT NULL CHECK (per_usd > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Manual overrides take precedence over provider snapshots in every SQL
-- aggregate, including when the server has no network access.
CREATE OR REPLACE FUNCTION trade_amount_usd(
  amount NUMERIC,
  orig_currency TEXT,
  exchange_rate NUMERIC,
  original_pnl_currency NUMERIC DEFAULT NULL
)
RETURNS NUMERIC LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN amount IS NULL THEN NULL
    WHEN original_pnl_currency IS NOT NULL THEN amount
    WHEN orig_currency IS NULL OR orig_currency = '' OR UPPER(orig_currency) = 'USD' THEN amount
    ELSE COALESCE(amount / NULLIF(COALESCE(
      (SELECT m.per_usd FROM manual_fx_rates m WHERE m.quote_code = UPPER(orig_currency)),
      (SELECT (r.rates ->> UPPER(orig_currency))::numeric
       FROM fx_daily_rates r WHERE r.base_code = 'USD'
       ORDER BY r.rate_date DESC LIMIT 1)
    ), 0), amount)
  END
$$;

DELETE FROM analytics_cache;
