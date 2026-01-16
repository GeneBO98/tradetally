-- Migration: Add multiple take profit targets and target hit analysis
-- Purpose: Enable tracking multiple TP targets with quantities, historical adjustments,
--          target hit analysis, and trade management R calculation

-- Multiple take profit targets as JSONB array
-- Each target: { id, price, quantity, order, hit_at, hit_price, status, created_at, updated_at }
ALTER TABLE trades ADD COLUMN IF NOT EXISTS take_profit_targets JSONB;

-- Historical TP/SL adjustments for management R calculation
-- Each adjustment: { timestamp, type, target_id, old_value, new_value, r_impact, reason }
ALTER TABLE trades ADD COLUMN IF NOT EXISTS risk_level_history JSONB;

-- Target hit analysis results from OHLCV data
-- Structure: { first_target_hit, analysis_timestamp, stop_loss_analysis, take_profit_analysis, conclusion }
ALTER TABLE trades ADD COLUMN IF NOT EXISTS target_hit_analysis JSONB;

-- Trade management R value - R captured/lost from management decisions
ALTER TABLE trades ADD COLUMN IF NOT EXISTS management_r DECIMAL(10,4);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_trades_take_profit_targets ON trades USING GIN (take_profit_targets);
CREATE INDEX IF NOT EXISTS idx_trades_management_r ON trades(management_r);
