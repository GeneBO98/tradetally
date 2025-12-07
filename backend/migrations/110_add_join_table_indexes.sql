-- Migration: Add indexes for JOIN tables used in trades query
-- Created: 2025-12-06
-- Description: Adds indexes on foreign key columns for faster LEFT JOINs in findByUser

-- Index for trade_attachments.trade_id (used in LEFT JOIN)
CREATE INDEX IF NOT EXISTS idx_trade_attachments_trade_id ON trade_attachments(trade_id);

-- Index for trade_charts.trade_id (used in LEFT JOIN)
CREATE INDEX IF NOT EXISTS idx_trade_charts_trade_id ON trade_charts(trade_id);

-- Index for trade_comments.trade_id (used in LEFT JOIN)
CREATE INDEX IF NOT EXISTS idx_trade_comments_trade_id ON trade_comments(trade_id);

-- Index for symbol_categories.symbol (used in LEFT JOIN)
CREATE INDEX IF NOT EXISTS idx_symbol_categories_symbol ON symbol_categories(symbol);

-- Composite index for trades.id + user_id (used in main query)
CREATE INDEX IF NOT EXISTS idx_trades_id_user_id ON trades(id, user_id);

-- Index for trades.entry_time (used in ORDER BY)
CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time DESC NULLS LAST);

-- Composite index for user_id + entry_time (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_trades_user_entry_time ON trades(user_id, entry_time DESC NULLS LAST);

-- Log completion
DO $$
BEGIN
  RAISE NOTICE 'JOIN table indexes created successfully';
END $$;
