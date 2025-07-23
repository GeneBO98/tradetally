-- Add statistics calculation preference to user settings
-- Users can choose between 'average' or 'median' for their analytics calculations

ALTER TABLE user_settings 
ADD COLUMN statistics_calculation VARCHAR(10) DEFAULT 'average' CHECK (statistics_calculation IN ('average', 'median'));

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_user_settings_statistics_calculation ON user_settings(statistics_calculation);

COMMENT ON COLUMN user_settings.statistics_calculation IS 'Determines whether to use average or median for analytics calculations (average, median)';