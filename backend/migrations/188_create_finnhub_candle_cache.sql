-- Persistent cache for Finnhub stock-candle responses. Used by
-- finnhub.getCandles() so sample-data signups (and any other repeat callers)
-- don't re-hit the Finnhub API for the same symbol/resolution/date range.
--
-- Historical candles are stable once the trading day closes, so entries can
-- live indefinitely. The fetched_at column is kept so a future eviction
-- policy could expire stale recent-bar rows without changing the schema.
CREATE TABLE IF NOT EXISTS finnhub_candle_cache (
  symbol VARCHAR(20) NOT NULL,
  resolution VARCHAR(10) NOT NULL,
  from_ts BIGINT NOT NULL,
  to_ts BIGINT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (symbol, resolution, from_ts, to_ts)
);

CREATE INDEX IF NOT EXISTS idx_finnhub_candle_cache_fetched_at
  ON finnhub_candle_cache (fetched_at);
