-- Prop-Firm Mode
-- Rule profiles for funded/evaluation accounts (Topstep, Apex, Tradovate evals,
-- ProjectX, etc.). A profile attaches firm rules (max daily loss, max drawdown,
-- profit target, minimum trading days) to a trading account identifier so
-- TradeTally can compute live pass/fail status from imported trades.

CREATE TABLE IF NOT EXISTS account_rule_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_identifier VARCHAR(50) NOT NULL,
  label VARCHAR(100),
  account_size NUMERIC(15,2) NOT NULL,
  max_daily_loss NUMERIC(15,2),
  max_drawdown NUMERIC(15,2),
  drawdown_mode VARCHAR(20) NOT NULL DEFAULT 'static',
  profit_target NUMERIC(15,2),
  min_trading_days INTEGER,
  start_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, account_identifier)
);

CREATE INDEX IF NOT EXISTS idx_account_rule_profiles_user_id
  ON account_rule_profiles(user_id);

COMMENT ON TABLE account_rule_profiles IS 'Prop-firm rule profiles: per-account funding/eval rules (max daily loss, max drawdown static/trailing, profit target, min trading days) used to compute live pass/breach status.';
COMMENT ON COLUMN account_rule_profiles.account_identifier IS 'Matches trades.account_identifier; only trades on/after start_date count toward the rules.';
COMMENT ON COLUMN account_rule_profiles.drawdown_mode IS 'static = floor fixed at account_size - max_drawdown; trailing = floor ratchets up with high-water equity.';
