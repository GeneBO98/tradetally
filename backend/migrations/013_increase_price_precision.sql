-- Increase decimal precision for price fields to support more granular trading
-- Change from DECIMAL(10, 2) to DECIMAL(15, 6) to support 6 decimal places

ALTER TABLE trades
ALTER COLUMN entry_price TYPE DECIMAL(15, 6),
ALTER COLUMN exit_price TYPE DECIMAL(15, 6),
ALTER COLUMN commission TYPE DECIMAL(15, 6),
ALTER COLUMN fees TYPE DECIMAL(15, 6),
ALTER COLUMN mae TYPE DECIMAL(15, 6),
ALTER COLUMN mfe TYPE DECIMAL(15, 6);

-- Update comments for clarity
COMMENT ON COLUMN trades.entry_price IS 'Entry price with up to 6 decimal places for precision';
COMMENT ON COLUMN trades.exit_price IS 'Exit price with up to 6 decimal places for precision';
COMMENT ON COLUMN trades.commission IS 'Commission paid with up to 6 decimal places for precision';
COMMENT ON COLUMN trades.fees IS 'Additional fees with up to 6 decimal places for precision';
COMMENT ON COLUMN trades.mae IS 'Maximum Adverse Excursion with up to 6 decimal places for precision';
COMMENT ON COLUMN trades.mfe IS 'Maximum Favorable Excursion with up to 6 decimal places for precision';