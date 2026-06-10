-- Persist detected multi-leg option strategy groups.
-- These groups are used by whole-trade analytics so multi-leg option
-- structures can be counted and classified as one position.

CREATE TABLE IF NOT EXISTS trade_position_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_identifier VARCHAR(255),
  underlying_symbol VARCHAR(20) NOT NULL,
  instrument_type VARCHAR(20) NOT NULL DEFAULT 'option',
  expiration_date DATE,
  entry_time TIMESTAMP WITH TIME ZONE,
  exit_time TIMESTAMP WITH TIME ZONE,
  trade_date DATE,
  detected_strategy VARCHAR(100),
  strategy_confidence DECIMAL(5,2),
  classification_method VARCHAR(50) DEFAULT 'option_strategy_rules',
  classification_metadata JSONB,
  total_pnl DECIMAL(15,2) DEFAULT 0,
  total_commission DECIMAL(15,2) DEFAULT 0,
  total_fees DECIMAL(15,2) DEFAULT 0,
  leg_count INTEGER NOT NULL DEFAULT 0,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE trades
ADD COLUMN IF NOT EXISTS position_group_id UUID REFERENCES trade_position_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_trade_position_groups_user_id
  ON trade_position_groups(user_id);

CREATE INDEX IF NOT EXISTS idx_trade_position_groups_detected_strategy
  ON trade_position_groups(detected_strategy);

CREATE INDEX IF NOT EXISTS idx_trade_position_groups_user_match
  ON trade_position_groups(user_id, account_identifier, underlying_symbol, expiration_date, trade_date);

CREATE INDEX IF NOT EXISTS idx_trades_position_group_id
  ON trades(position_group_id);

CREATE INDEX IF NOT EXISTS idx_trades_option_group_candidates
  ON trades(user_id, account_identifier, underlying_symbol, trade_date, expiration_date, entry_time)
  WHERE instrument_type = 'option' AND entry_time IS NOT NULL;

CREATE OR REPLACE FUNCTION update_trade_position_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_trade_position_groups_updated_at ON trade_position_groups;
CREATE TRIGGER update_trade_position_groups_updated_at
  BEFORE UPDATE ON trade_position_groups
  FOR EACH ROW
  EXECUTE FUNCTION update_trade_position_groups_updated_at();

