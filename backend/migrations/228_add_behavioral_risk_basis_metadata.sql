ALTER TABLE IF EXISTS revenge_trading_events
  ADD COLUMN IF NOT EXISTS calculation_version VARCHAR(50),
  ADD COLUMN IF NOT EXISTS analysis_run_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS risk_basis JSONB DEFAULT '{}';

ALTER TABLE IF EXISTS overconfidence_events
  ADD COLUMN IF NOT EXISTS calculation_version VARCHAR(50),
  ADD COLUMN IF NOT EXISTS analysis_run_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS risk_basis JSONB DEFAULT '{}';

DELETE FROM revenge_trading_events;

DELETE FROM behavioral_patterns
WHERE pattern_type IN (
  'same_symbol_revenge',
  'emotional_reactive_trading',
  'revenge_trading',
  'overconfidence_bias'
);

DELETE FROM overconfidence_events;

UPDATE win_loss_streaks
SET is_active = false,
    updated_at = CURRENT_TIMESTAMP
WHERE is_active = true;

DELETE FROM analytics_cache;
