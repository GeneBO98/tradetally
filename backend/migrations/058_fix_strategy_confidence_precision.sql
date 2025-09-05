-- Fix strategy_confidence field precision to allow percentage values (0-100)
-- Change from DECIMAL(3,2) which can only hold -9.99 to 9.99
-- to DECIMAL(5,2) which can hold -999.99 to 999.99

ALTER TABLE trades 
ALTER COLUMN strategy_confidence TYPE DECIMAL(5,2);

-- Update comment for clarity
COMMENT ON COLUMN trades.strategy_confidence IS 'Strategy classification confidence as percentage (0-100)';