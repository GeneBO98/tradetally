BEGIN;

-- Legacy migration 007 rebuilds trades_with_health_analytics with columns that
-- were introduced later in the historical migration stream. Keep this shim
-- idempotent so fresh rebuilds and long-lived databases converge safely.
ALTER TABLE trades
  ADD COLUMN IF NOT EXISTS split_adjusted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS original_quantity DECIMAL(15, 4),
  ADD COLUMN IF NOT EXISTS original_entry_price DECIMAL(15, 4),
  ADD COLUMN IF NOT EXISTS original_exit_price DECIMAL(15, 4),
  ADD COLUMN IF NOT EXISTS strategy_confidence DECIMAL(5, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS classification_method VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS classification_metadata JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS manual_override BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS round_trip_id UUID,
  ADD COLUMN IF NOT EXISTS news_events JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS has_news BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS news_sentiment VARCHAR(20),
  ADD COLUMN IF NOT EXISTS news_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confidence INTEGER,
  ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(20) DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS enrichment_completed_at TIMESTAMPTZ;

COMMIT;
