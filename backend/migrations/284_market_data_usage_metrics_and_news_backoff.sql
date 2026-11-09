-- Migration 284: Finnhub usage metrics for every install + news refresh backoff
--
-- 1. finnhub_usage_minute_metrics previously only existed on the hosted
--    deployment. The recorder now ships in the public app so self-hosters
--    can see where their provider budget goes. The table records request
--    outcomes (success / empty payload / error / upstream 429) as well as
--    volume. On instances that already have the table this only adds the
--    missing outcome columns.
-- 2. dashboard_news_cache.unchanged_streak counts consecutive scheduled
--    refreshes that returned the same headlines, so quiet symbols back off.
--
-- Every statement is idempotent and none can raise the exceptions the
-- migration runner swallows, so the whole file applies or nothing does.

CREATE TABLE IF NOT EXISTS finnhub_usage_minute_metrics (
  id BIGSERIAL PRIMARY KEY,
  minute_bucket TIMESTAMPTZ NOT NULL,
  endpoint VARCHAR(120) NOT NULL,
  source VARCHAR(120) NOT NULL DEFAULT 'unknown',
  request_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  empty_count INTEGER NOT NULL DEFAULT 0,
  rate_limited_count INTEGER NOT NULL DEFAULT 0,
  throttled_count INTEGER NOT NULL DEFAULT 0,
  total_throttle_wait_ms BIGINT NOT NULL DEFAULT 0,
  max_throttle_wait_ms INTEGER NOT NULL DEFAULT 0,
  configured_limit_per_minute INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT finnhub_usage_minute_metrics_unique UNIQUE (minute_bucket, endpoint, source)
);

ALTER TABLE finnhub_usage_minute_metrics
  ADD COLUMN IF NOT EXISTS success_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS error_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS empty_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_finnhub_usage_minute_metrics_bucket
  ON finnhub_usage_minute_metrics (minute_bucket DESC);

CREATE INDEX IF NOT EXISTS idx_finnhub_usage_minute_metrics_endpoint
  ON finnhub_usage_minute_metrics (endpoint);

COMMENT ON COLUMN finnhub_usage_minute_metrics.request_count IS 'Requests sent to Finnhub (includes 429 retries)';
COMMENT ON COLUMN finnhub_usage_minute_metrics.success_count IS 'Responses with a non-empty payload';
COMMENT ON COLUMN finnhub_usage_minute_metrics.empty_count IS 'HTTP 200 responses with an empty payload ({}, [], no_data, all-zero quote)';
COMMENT ON COLUMN finnhub_usage_minute_metrics.error_count IS 'Failed requests other than upstream 429s';
COMMENT ON COLUMN finnhub_usage_minute_metrics.rate_limited_count IS 'Finnhub upstream 429 responses';
COMMENT ON COLUMN finnhub_usage_minute_metrics.throttled_count IS 'Local scheduler skips/timeouts before a provider request was sent';

ALTER TABLE dashboard_news_cache
  ADD COLUMN IF NOT EXISTS unchanged_streak INTEGER NOT NULL DEFAULT 0;
