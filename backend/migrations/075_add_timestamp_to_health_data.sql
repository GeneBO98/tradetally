-- Add timestamp column to health_data for time-series tracking
-- This allows storing heart rate at 1-minute intervals instead of daily averages

-- Add timestamp column
ALTER TABLE health_data ADD COLUMN IF NOT EXISTS timestamp TIMESTAMP WITH TIME ZONE;

-- Drop the old unique constraint that prevents multiple readings per day
ALTER TABLE health_data DROP CONSTRAINT IF EXISTS health_data_user_id_date_data_type_key;

-- Create new unique constraint that allows multiple readings per day but prevents exact duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_data_unique_timestamp
ON health_data(user_id, data_type, timestamp)
WHERE timestamp IS NOT NULL;

-- For backwards compatibility, keep date-only records unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_data_unique_date
ON health_data(user_id, data_type, date)
WHERE timestamp IS NULL;

-- Add index for efficient time-based queries
CREATE INDEX IF NOT EXISTS idx_health_data_timestamp ON health_data(user_id, timestamp DESC) WHERE timestamp IS NOT NULL;

-- Update existing heart_rate records to have a timestamp (set to noon on that date)
UPDATE health_data
SET timestamp = date + TIME '12:00:00'
WHERE data_type = 'heartRate' AND timestamp IS NULL;

-- Comment on the new column
COMMENT ON COLUMN health_data.timestamp IS 'Specific timestamp for time-series data (e.g., heart rate readings every minute). NULL for daily aggregates like sleep.';
