-- Migration: Remove 'neither' option from manual_target_hit_first
-- We only need to indicate whether SL or TP was hit - if neither, it's inferred from context

-- Drop the existing constraint
ALTER TABLE trades DROP CONSTRAINT IF EXISTS check_manual_target_hit_first;

-- Add new constraint without 'neither'
ALTER TABLE trades ADD CONSTRAINT check_manual_target_hit_first
  CHECK (manual_target_hit_first IS NULL OR manual_target_hit_first IN ('take_profit', 'stop_loss'));

-- Update any existing 'neither' values to NULL (they will be inferred from context)
UPDATE trades 
SET manual_target_hit_first = NULL 
WHERE manual_target_hit_first = 'neither';

-- Update comment
COMMENT ON COLUMN trades.manual_target_hit_first IS 'Manual override for target hit analysis. Values: take_profit, stop_loss, or NULL to infer from context';
