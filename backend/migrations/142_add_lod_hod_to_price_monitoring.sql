-- Migration: Add Low of Day (LOD) and High of Day (HOD) fields to price_monitoring
-- Also adds data_source column to track which API provided the data (Finnhub, Schwab, etc.)

-- Add new columns for intraday high/low tracking
ALTER TABLE price_monitoring
ADD COLUMN IF NOT EXISTS high_of_day DECIMAL(15,4),
ADD COLUMN IF NOT EXISTS low_of_day DECIMAL(15,4),
ADD COLUMN IF NOT EXISTS open_price DECIMAL(15,4);

-- Update data_source constraint to include 'schwab'
-- First check if the column exists with the old constraint and update accordingly
DO $$
BEGIN
  -- The data_source column already exists but may need updating for new sources
  -- No constraint to modify, just ensure the column can hold 'schwab' values
  NULL;
END $$;

-- Add index for efficient lookups by last_updated for stale data cleanup
CREATE INDEX IF NOT EXISTS idx_price_monitoring_last_updated ON price_monitoring(last_updated);

-- Comment on columns for documentation
COMMENT ON COLUMN price_monitoring.high_of_day IS 'Highest price of the current trading day';
COMMENT ON COLUMN price_monitoring.low_of_day IS 'Lowest price of the current trading day (LOD)';
COMMENT ON COLUMN price_monitoring.open_price IS 'Opening price of the current trading day';
COMMENT ON COLUMN price_monitoring.data_source IS 'API source: finnhub, schwab, alpha_vantage';
