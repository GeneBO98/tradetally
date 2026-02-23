-- Add contribute_anonymous_data setting to user_settings
-- Controls whether user's anonymized data is included in Community Insights
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS contribute_anonymous_data BOOLEAN DEFAULT TRUE;
