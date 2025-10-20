-- Migration: Add R-value (Risk/Reward Ratio) tracking fields to trades
-- This enables traders to track their risk management by recording stop loss,
-- take profit levels, and calculated R-value for each trade

-- Add stop_loss column (the price level where the trader exits to limit losses)
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS stop_loss DECIMAL(15,6);

-- Add take_profit column (the price level where the trader exits to take profits)
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS take_profit DECIMAL(15,6);

-- Add r_value column (calculated risk/reward ratio: Reward/Risk)
-- For Long positions: R = (takeProfit - entryPrice) / (entryPrice - stopLoss)
-- For Short positions: R = (entryPrice - takeProfit) / (stopLoss - entryPrice)
-- A value of 2.0 means 1:2 risk/reward ratio (risk $1 to potentially gain $2)
ALTER TABLE trades
ADD COLUMN IF NOT EXISTS r_value DECIMAL(10,2);

-- Create indexes for performance when filtering/sorting by R-value
CREATE INDEX IF NOT EXISTS idx_trades_r_value ON trades(r_value);
CREATE INDEX IF NOT EXISTS idx_trades_stop_loss ON trades(stop_loss);
CREATE INDEX IF NOT EXISTS idx_trades_take_profit ON trades(take_profit);

-- Add comments for documentation
COMMENT ON COLUMN trades.stop_loss IS
'The price level where the trader plans to exit the position to limit losses. Used to calculate risk in R-value.';

COMMENT ON COLUMN trades.take_profit IS
'The price level where the trader plans to exit the position to take profits. Used to calculate reward in R-value.';

COMMENT ON COLUMN trades.r_value IS
'Risk/Reward ratio calculated as Reward/Risk. For long positions: (takeProfit - entryPrice) / (entryPrice - stopLoss). For short positions: (entryPrice - takeProfit) / (stopLoss - entryPrice). A value of 2.0 represents a 1:2 risk/reward ratio.';
