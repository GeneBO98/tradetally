-- Migration: Add manual_target_hit_first field to trades table
-- This allows users without Alpha Vantage API access to manually specify
-- which target (take profit or stop loss) was hit first

-- Add the manual_target_hit_first column
-- Values: 'take_profit', 'stop_loss', 'neither', NULL (for auto/not set)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS manual_target_hit_first VARCHAR(20);

-- Add a check constraint to ensure valid values
ALTER TABLE trades ADD CONSTRAINT check_manual_target_hit_first
  CHECK (manual_target_hit_first IS NULL OR manual_target_hit_first IN ('take_profit', 'stop_loss', 'neither'));

-- Add comment for documentation
COMMENT ON COLUMN trades.manual_target_hit_first IS 'Manual override for target hit analysis. Values: take_profit, stop_loss, neither, or NULL for auto-detection';
