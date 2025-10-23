-- Fix quality_score column type from INTEGER to NUMERIC
-- This allows storing decimal values like 4.1, 3.7, etc.

ALTER TABLE trades
  ALTER COLUMN quality_score TYPE NUMERIC(3,1);

-- quality_score is now NUMERIC(3,1) which allows values like 0.0 to 5.0 with one decimal place
