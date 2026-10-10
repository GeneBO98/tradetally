-- Generic persistent cache for Finnhub responses whose data is
-- effectively immutable once a date range or trading day closes — company
-- news for past windows, company profiles, stock splits, dividends, etc.
--
-- Candle data has its own specialised table (finnhub_candle_cache) because
-- the (symbol, resolution, from, to) key is queried frequently. Everything
-- else lands here under (endpoint, cache_key).
--
-- expires_at is optional. When NULL the entry lives indefinitely. Callers
-- that fetch data containing "today" should set a near-future expiry so a
-- partially-formed response doesn't get pinned.
CREATE TABLE IF NOT EXISTS finnhub_response_cache (
  endpoint VARCHAR(50) NOT NULL,
  cache_key TEXT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE,
  PRIMARY KEY (endpoint, cache_key)
);

CREATE INDEX IF NOT EXISTS idx_finnhub_response_cache_expires_at
  ON finnhub_response_cache (expires_at)
  WHERE expires_at IS NOT NULL;
