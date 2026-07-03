-- Market risk indicators cache table
-- Stores computed macro market-risk indicators (Shiller CAPE, Buffett Indicator,
-- Tobin's Q, yield curve, S&P 500/M2, VIX, high-yield spread) so the dashboard
-- widget and public page serve instantly without hitting external sources.

CREATE TABLE IF NOT EXISTS market_risk_cache (
  id SERIAL PRIMARY KEY,
  cache_key VARCHAR(64) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT market_risk_cache_key_unique UNIQUE (cache_key)
);

CREATE INDEX IF NOT EXISTS idx_market_risk_cache_fetched_at ON market_risk_cache(fetched_at);
