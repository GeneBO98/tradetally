-- Add currency support to trades table
-- Migration 069: Add currency tracking and conversion rate storage

-- Add currency columns to trades table
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS original_currency VARCHAR(3) DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS exchange_rate DECIMAL(20, 10) DEFAULT 1.0,
ADD COLUMN IF NOT EXISTS original_entry_price_currency DECIMAL(20, 8),
ADD COLUMN IF NOT EXISTS original_exit_price_currency DECIMAL(20, 8),
ADD COLUMN IF NOT EXISTS original_pnl_currency DECIMAL(20, 8),
ADD COLUMN IF NOT EXISTS original_commission_currency DECIMAL(20, 8),
ADD COLUMN IF NOT EXISTS original_fees_currency DECIMAL(20, 8);

-- Create index for currency queries
CREATE INDEX IF NOT EXISTS idx_trades_original_currency ON trades(original_currency);

-- Add comment explaining the columns
COMMENT ON COLUMN trades.original_currency IS 'Original currency code (e.g., EUR, GBP, CAD) - defaults to USD';
COMMENT ON COLUMN trades.exchange_rate IS 'Exchange rate to USD at time of trade';
COMMENT ON COLUMN trades.original_entry_price_currency IS 'Entry price in original currency before conversion';
COMMENT ON COLUMN trades.original_exit_price_currency IS 'Exit price in original currency before conversion';
COMMENT ON COLUMN trades.original_pnl_currency IS 'P&L in original currency before conversion';
COMMENT ON COLUMN trades.original_commission_currency IS 'Commission in original currency before conversion';
COMMENT ON COLUMN trades.original_fees_currency IS 'Fees in original currency before conversion';
