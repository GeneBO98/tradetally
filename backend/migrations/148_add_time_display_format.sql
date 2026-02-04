-- Add time display format preference to user_settings (24-hour military vs 12-hour American)
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS time_display_format VARCHAR(10) DEFAULT '24h';

COMMENT ON COLUMN user_settings.time_display_format IS 'User preference for time display: 24h (14:00) or 12h (2:00 PM)';
