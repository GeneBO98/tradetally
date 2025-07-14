-- Revert decimal precision back to DECIMAL(10, 2) for price fields
-- This undoes migration 013 which increased precision to 6 decimal places

ALTER TABLE trades
ALTER COLUMN entry_price TYPE DECIMAL(10, 2),
ALTER COLUMN exit_price TYPE DECIMAL(10, 2),
ALTER COLUMN commission TYPE DECIMAL(10, 2),
ALTER COLUMN fees TYPE DECIMAL(10, 2),
ALTER COLUMN mae TYPE DECIMAL(10, 2),
ALTER COLUMN mfe TYPE DECIMAL(10, 2);

-- Update comments back to original
COMMENT ON COLUMN trades.entry_price IS 'Entry price with up to 2 decimal places';
COMMENT ON COLUMN trades.exit_price IS 'Exit price with up to 2 decimal places';
COMMENT ON COLUMN trades.commission IS 'Commission paid with up to 2 decimal places';
COMMENT ON COLUMN trades.fees IS 'Additional fees with up to 2 decimal places';
COMMENT ON COLUMN trades.mae IS 'Maximum Adverse Excursion with up to 2 decimal places';
COMMENT ON COLUMN trades.mfe IS 'Maximum Favorable Excursion with up to 2 decimal places';