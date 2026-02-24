-- Add composite indexes to speed up analytics queries
-- These cover the most common WHERE patterns: user_id + trade_date range + exit_price/pnl filtering

-- Composite index for general analytics queries (user + date range + completion check)
CREATE INDEX IF NOT EXISTS idx_trades_user_date_pnl ON trades(user_id, trade_date, exit_price, pnl);

-- Partial index for completed trades analytics (most queries filter exit_price IS NOT NULL AND pnl IS NOT NULL)
CREATE INDEX IF NOT EXISTS idx_trades_user_completed ON trades(user_id, trade_date, pnl, symbol) WHERE exit_price IS NOT NULL AND pnl IS NOT NULL;
