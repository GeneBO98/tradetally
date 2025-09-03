-- Fix numeric overflow issue in overconfidence_events table
-- The position_size_increase_percent field was too small to handle large percentage increases

-- Alter the column to support larger percentages (up to 9999.99%)
ALTER TABLE overconfidence_events 
ALTER COLUMN position_size_increase_percent TYPE DECIMAL(7,2);

-- Also update the revenge_trading_events table for consistency
ALTER TABLE revenge_trading_events 
ALTER COLUMN position_size_increase_percent TYPE DECIMAL(7,2);

-- Update comment
COMMENT ON COLUMN overconfidence_events.position_size_increase_percent IS 'Percentage increase from baseline to peak (supports up to 9999.99%)';