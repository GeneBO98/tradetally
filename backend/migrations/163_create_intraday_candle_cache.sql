CREATE TABLE IF NOT EXISTS intraday_candle_cache (
  symbol VARCHAR(20) NOT NULL,
  resolution VARCHAR(10) NOT NULL,
  candle_time TIMESTAMP WITH TIME ZONE NOT NULL,
  open NUMERIC(20, 8),
  high NUMERIC(20, 8),
  low NUMERIC(20, 8),
  close NUMERIC(20, 8),
  volume NUMERIC(20, 8),
  data_source VARCHAR(50) DEFAULT 'unknown',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (symbol, resolution, candle_time)
);

CREATE INDEX IF NOT EXISTS idx_intraday_candle_cache_symbol_resolution_time
  ON intraday_candle_cache (symbol, resolution, candle_time);

CREATE INDEX IF NOT EXISTS idx_intraday_candle_cache_last_accessed
  ON intraday_candle_cache (last_accessed_at);

CREATE INDEX IF NOT EXISTS idx_intraday_candle_cache_resolution_time
  ON intraday_candle_cache (resolution, candle_time);
