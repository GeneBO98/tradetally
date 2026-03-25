-- Migration 164: Create user_engagement_summary table for aggregated engagement metrics
-- Recomputed periodically by engagement scheduler for marketing segmentation and CRM sync

CREATE TABLE IF NOT EXISTS user_engagement_summary (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- Activity dates
  first_trade_at TIMESTAMP WITH TIME ZONE,
  last_trade_at TIMESTAMP WITH TIME ZONE,
  first_import_at TIMESTAMP WITH TIME ZONE,
  last_import_at TIMESTAMP WITH TIME ZONE,
  first_diary_at TIMESTAMP WITH TIME ZONE,
  last_diary_at TIMESTAMP WITH TIME ZONE,
  first_broker_sync_at TIMESTAMP WITH TIME ZONE,
  last_broker_sync_at TIMESTAMP WITH TIME ZONE,

  -- Counts
  total_trades INTEGER DEFAULT 0,
  total_imports INTEGER DEFAULT 0,
  total_diary_entries INTEGER DEFAULT 0,
  total_broker_syncs INTEGER DEFAULT 0,

  -- Feature usage tracking
  features_used JSONB DEFAULT '{}',
  last_feature_used VARCHAR(100),
  most_used_feature VARCHAR(100),

  -- Engagement metrics (recomputed by scheduler)
  days_active_last_7 INTEGER DEFAULT 0,
  days_active_last_30 INTEGER DEFAULT 0,
  days_active_last_90 INTEGER DEFAULT 0,
  engagement_score INTEGER DEFAULT 0,
  engagement_tier VARCHAR(20) DEFAULT 'new',

  -- Lifecycle
  lifecycle_stage VARCHAR(30) DEFAULT 'signed_up',

  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_engagement_score ON user_engagement_summary(engagement_score DESC);
CREATE INDEX idx_engagement_tier ON user_engagement_summary(engagement_tier);
CREATE INDEX idx_engagement_lifecycle ON user_engagement_summary(lifecycle_stage);
