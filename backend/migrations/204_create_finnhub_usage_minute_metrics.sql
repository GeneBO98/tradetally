-- Migration: Create Finnhub provider usage minute metrics
-- Purpose: Aggregate actual Finnhub provider requests, upstream 429s, and local scheduler throttling for admin capacity analytics.

CREATE TABLE IF NOT EXISTS finnhub_usage_minute_metrics (
  id BIGSERIAL PRIMARY KEY,
  minute_bucket TIMESTAMPTZ NOT NULL,
  endpoint VARCHAR(120) NOT NULL,
  source VARCHAR(120) NOT NULL DEFAULT 'unknown',
  request_count INTEGER NOT NULL DEFAULT 0,
  rate_limited_count INTEGER NOT NULL DEFAULT 0,
  throttled_count INTEGER NOT NULL DEFAULT 0,
  total_throttle_wait_ms BIGINT NOT NULL DEFAULT 0,
  max_throttle_wait_ms INTEGER NOT NULL DEFAULT 0,
  configured_limit_per_minute INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT finnhub_usage_minute_metrics_counts_check CHECK (
    request_count >= 0
    AND rate_limited_count >= 0
    AND throttled_count >= 0
    AND total_throttle_wait_ms >= 0
    AND max_throttle_wait_ms >= 0
  ),
  CONSTRAINT finnhub_usage_minute_metrics_unique UNIQUE (minute_bucket, endpoint, source)
);

CREATE INDEX IF NOT EXISTS idx_finnhub_usage_minute_metrics_bucket
  ON finnhub_usage_minute_metrics(minute_bucket DESC);

CREATE INDEX IF NOT EXISTS idx_finnhub_usage_minute_metrics_endpoint
  ON finnhub_usage_minute_metrics(endpoint);

COMMENT ON TABLE finnhub_usage_minute_metrics IS 'Per-minute aggregate metrics for Finnhub provider capacity and throttling analytics';
COMMENT ON COLUMN finnhub_usage_minute_metrics.request_count IS 'Actual requests sent to Finnhub';
COMMENT ON COLUMN finnhub_usage_minute_metrics.rate_limited_count IS 'Finnhub upstream 429 responses';
COMMENT ON COLUMN finnhub_usage_minute_metrics.throttled_count IS 'Local scheduler skips/timeouts before a provider request was sent';
