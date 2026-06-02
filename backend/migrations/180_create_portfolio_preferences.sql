-- Portfolio preferences for benchmark comparison and alert thresholds
CREATE TABLE IF NOT EXISTS portfolio_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  default_benchmark_symbol VARCHAR(20) NOT NULL DEFAULT 'SPY',
  drift_threshold_percent DECIMAL(6,2) NOT NULL DEFAULT 5.00,
  drawdown_threshold_percent DECIMAL(6,2) NOT NULL DEFAULT 10.00,
  alerts_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT portfolio_preferences_user_unique UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_preferences_user_id
ON portfolio_preferences(user_id);

DROP TRIGGER IF EXISTS update_portfolio_preferences_updated_at ON portfolio_preferences;
CREATE TRIGGER update_portfolio_preferences_updated_at
  BEFORE UPDATE ON portfolio_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE portfolio_preferences IS 'Stores per-user portfolio benchmark defaults and alert thresholds';
