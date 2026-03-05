-- Dashboard earnings cache table
-- Stores pre-fetched earnings calendar from Finnhub to avoid blocking dashboard loads

CREATE TABLE IF NOT EXISTS dashboard_earnings_cache (
  id SERIAL PRIMARY KEY,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  earnings_data JSONB NOT NULL DEFAULT '[]',
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT dashboard_earnings_cache_range_unique UNIQUE (date_from, date_to)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_earnings_cache_fetched_at ON dashboard_earnings_cache(fetched_at);
