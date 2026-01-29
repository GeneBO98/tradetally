-- Migration: Performance Optimization Indexes
-- Purpose: Add compound indexes to improve query performance for common filter combinations

-- Note: These indexes are created without CONCURRENTLY to work within transactions
-- In production, you may want to run these manually with CONCURRENTLY to avoid table locks

-- Compound indexes for the most common filter combinations in trades table

-- 1. Index for dashboard and trades list with date filtering (most common query)
CREATE INDEX IF NOT EXISTS idx_trades_user_date_status_pnl
ON trades(user_id, trade_date DESC, status, pnl)
WHERE exit_price IS NOT NULL;

-- 2. Index for symbol-specific queries with date range
CREATE INDEX IF NOT EXISTS idx_trades_user_symbol_date
ON trades(user_id, symbol, trade_date DESC);

-- 3. Index for account-specific filtering (global account filter)
CREATE INDEX IF NOT EXISTS idx_trades_user_account_date
ON trades(user_id, account_identifier, trade_date DESC)
WHERE account_identifier IS NOT NULL;

-- 4. Index for strategy filtering with dates
CREATE INDEX IF NOT EXISTS idx_trades_user_strategy_date
ON trades(user_id, strategy, trade_date DESC)
WHERE strategy IS NOT NULL;

-- 5. Index for open positions queries
CREATE INDEX IF NOT EXISTS idx_trades_user_status_symbol
ON trades(user_id, status, symbol)
WHERE status = 'open';

-- 6. Index for analytics calculations (P&L aggregations)
CREATE INDEX IF NOT EXISTS idx_trades_user_exit_pnl
ON trades(user_id, exit_price, pnl)
WHERE exit_price IS NOT NULL AND pnl IS NOT NULL;

-- 7. Compound index for multi-filter queries (tags + dates)
CREATE INDEX IF NOT EXISTS idx_trades_user_tags_date
ON trades(user_id, trade_date DESC)
WHERE tags IS NOT NULL AND array_length(tags, 1) > 0;

-- 8. Index for broker filtering
CREATE INDEX IF NOT EXISTS idx_trades_user_broker_date
ON trades(user_id, broker, trade_date DESC)
WHERE broker IS NOT NULL;

-- 9. Optimize CUSIP mappings lookup
CREATE INDEX IF NOT EXISTS idx_cusip_mappings_lookup_optimized
ON cusip_mappings(cusip, ticker, user_id)
WHERE verified = true;

-- 10. Index for frequently used analytics date ranges
CREATE INDEX IF NOT EXISTS idx_trades_user_date_entry_exit
ON trades(user_id, trade_date, entry_time, exit_time)
WHERE exit_price IS NOT NULL;

-- Add index hints comment for complex queries
COMMENT ON INDEX idx_trades_user_date_status_pnl IS 'Primary index for dashboard and filtered trade lists';
COMMENT ON INDEX idx_trades_user_symbol_date IS 'Optimizes symbol-specific trade lookups';
COMMENT ON INDEX idx_trades_user_account_date IS 'Supports global account filtering feature';
COMMENT ON INDEX idx_trades_user_strategy_date IS 'Speeds up strategy-based filtering';
COMMENT ON INDEX idx_trades_user_status_symbol IS 'Optimizes open positions queries';
COMMENT ON INDEX idx_trades_user_exit_pnl IS 'Accelerates analytics P&L calculations';
COMMENT ON INDEX idx_cusip_mappings_lookup_optimized IS 'Optimizes CUSIP to ticker resolution';

-- Analyze tables to update statistics for query planner
ANALYZE trades;
ANALYZE cusip_mappings;