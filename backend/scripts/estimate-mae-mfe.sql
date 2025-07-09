-- Estimate MAE/MFE for existing trades where they are null
-- This is a rough estimate assuming the worst case happened at exit

UPDATE trades 
SET 
  mae = CASE 
    WHEN side = 'long' AND exit_price IS NOT NULL THEN 
      LEAST(0, (exit_price - entry_price) * quantity) - commission - fees
    WHEN side = 'short' AND exit_price IS NOT NULL THEN 
      LEAST(0, (entry_price - exit_price) * quantity) - commission - fees
    ELSE NULL
  END,
  mfe = CASE 
    WHEN side = 'long' AND exit_price IS NOT NULL THEN 
      GREATEST(0, (exit_price - entry_price) * quantity)
    WHEN side = 'short' AND exit_price IS NOT NULL THEN 
      GREATEST(0, (entry_price - exit_price) * quantity)
    ELSE NULL
  END
WHERE mae IS NULL 
  AND mfe IS NULL 
  AND exit_price IS NOT NULL 
  AND pnl IS NOT NULL;