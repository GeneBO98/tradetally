-- Dashboard news cache table
-- Stores pre-fetched company news from Finnhub to avoid blocking dashboard loads

CREATE TABLE IF NOT EXISTS dashboard_news_cache (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(128) NOT NULL,
  news_items JSONB NOT NULL DEFAULT '[]',
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT dashboard_news_cache_symbol_unique UNIQUE (symbol)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_news_cache_symbol ON dashboard_news_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_dashboard_news_cache_fetched_at ON dashboard_news_cache(fetched_at);
