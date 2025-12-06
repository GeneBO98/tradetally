-- Migration 107: Add chart_url field to trades table
-- Allows users to paste TradingView or other chart links directly

ALTER TABLE trades
ADD COLUMN IF NOT EXISTS chart_url VARCHAR(1000);

-- Add comment
COMMENT ON COLUMN trades.chart_url IS 'External chart URL (e.g., TradingView snapshot link)';
