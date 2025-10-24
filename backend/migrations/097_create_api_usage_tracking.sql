-- Migration: Create API usage tracking table for tier-based rate limiting
-- Created: 2025-01-24
-- Purpose: Track Finnhub API usage per user to enforce free tier limits (200 calls/day for quotes and candles)

CREATE TABLE IF NOT EXISTS api_usage_tracking (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint_type VARCHAR(50) NOT NULL, -- 'quote', 'candle', 'indicator', 'pattern', 'support_resistance'
  call_count INTEGER NOT NULL DEFAULT 0,
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reset_at TIMESTAMP NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '1 day'),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- Composite unique constraint to ensure one row per user per endpoint per day
  CONSTRAINT unique_user_endpoint_date UNIQUE (user_id, endpoint_type, usage_date)
);

-- Index for fast user lookups
CREATE INDEX idx_api_usage_user_date ON api_usage_tracking(user_id, usage_date);

-- Index for cleanup operations
CREATE INDEX idx_api_usage_reset_at ON api_usage_tracking(reset_at);

-- Add comment
COMMENT ON TABLE api_usage_tracking IS 'Tracks daily Finnhub API usage per user for tier-based rate limiting';
COMMENT ON COLUMN api_usage_tracking.endpoint_type IS 'Type of API endpoint: quote, candle, indicator, pattern, support_resistance';
COMMENT ON COLUMN api_usage_tracking.call_count IS 'Number of API calls made for this endpoint today';
COMMENT ON COLUMN api_usage_tracking.usage_date IS 'Date of usage (used for daily reset)';
COMMENT ON COLUMN api_usage_tracking.reset_at IS 'When the counter will be reset (typically next day at midnight UTC)';
