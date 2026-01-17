-- Migration: Add trade_dividends table for automatic dividend tracking
-- This table stores dividends automatically detected for trade-based holdings

CREATE TABLE IF NOT EXISTS trade_dividends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,

  -- Dividend details
  ex_dividend_date DATE NOT NULL,
  payment_date DATE,
  dividend_per_share DECIMAL(10,6) NOT NULL,

  -- Position at ex-date
  shares_held DECIMAL(15,6) NOT NULL,
  total_amount DECIMAL(20,2) NOT NULL,

  -- Metadata
  source VARCHAR(20) DEFAULT 'auto', -- 'auto' or 'manual'
  data_provider VARCHAR(20), -- 'finnhub' or 'alphavantage'
  created_at TIMESTAMP DEFAULT NOW(),

  -- Prevent duplicates: same user, symbol, and ex-dividend date
  UNIQUE(user_id, symbol, ex_dividend_date)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_trade_dividends_user ON trade_dividends(user_id);
CREATE INDEX IF NOT EXISTS idx_trade_dividends_symbol ON trade_dividends(symbol);
CREATE INDEX IF NOT EXISTS idx_trade_dividends_ex_date ON trade_dividends(ex_dividend_date);
CREATE INDEX IF NOT EXISTS idx_trade_dividends_user_symbol ON trade_dividends(user_id, symbol);
