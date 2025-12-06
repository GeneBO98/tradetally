-- Migration: Add performance indexes for analytics queries
-- Created: 2025-12-05
-- Description: Adds composite indexes to optimize analytics endpoint performance

-- Composite index for user_id + trade_date (most common filter in analytics)
CREATE INDEX IF NOT EXISTS idx_trades_user_trade_date ON trades(user_id, trade_date);

-- Composite index for user_id + pnl (used for P&L calculations and filtering)
CREATE INDEX IF NOT EXISTS idx_trades_user_pnl ON trades(user_id, pnl) WHERE pnl IS NOT NULL;

-- Composite index for user_id + exit_price (used to identify completed trades)
CREATE INDEX IF NOT EXISTS idx_trades_user_exit_price ON trades(user_id, exit_price) WHERE exit_price IS NOT NULL;

-- Composite index for user_id + symbol (used for symbol filtering and grouping)
CREATE INDEX IF NOT EXISTS idx_trades_user_symbol ON trades(user_id, symbol);

-- Composite index for user_id + side (used for side filtering in analytics)
CREATE INDEX IF NOT EXISTS idx_trades_user_side ON trades(user_id, side);

-- Composite index for user_id + broker (used for broker filtering)
CREATE INDEX IF NOT EXISTS idx_trades_user_broker ON trades(user_id, broker) WHERE broker IS NOT NULL;

-- Composite index for user_id + strategy (used for strategy filtering)
CREATE INDEX IF NOT EXISTS idx_trades_user_strategy ON trades(user_id, strategy) WHERE strategy IS NOT NULL;

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'Analytics performance indexes created successfully';
END $$;
