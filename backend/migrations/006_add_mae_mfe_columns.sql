-- Add MAE and MFE columns to trades table
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS mae DECIMAL(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS mfe DECIMAL(10, 2) DEFAULT NULL;

-- Add comments for clarity
COMMENT ON COLUMN trades.mae IS 'Maximum Adverse Excursion - largest unrealized loss during trade';
COMMENT ON COLUMN trades.mfe IS 'Maximum Favorable Excursion - largest unrealized profit during trade';