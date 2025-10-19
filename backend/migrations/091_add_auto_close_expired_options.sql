-- Migration: Add auto_close_expired_options setting to user_settings
-- This allows users to control whether expired options are automatically closed by the scheduler

-- Add the column with default value of true (enabled by default)
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS auto_close_expired_options boolean DEFAULT true;

-- Create index for performance when scheduler queries for users with auto-close enabled
CREATE INDEX IF NOT EXISTS idx_user_settings_auto_close_expired
ON user_settings(user_id, auto_close_expired_options);

-- Add comment for documentation
COMMENT ON COLUMN user_settings.auto_close_expired_options IS
'When true, the system will automatically close expired options positions with appropriate P&L (Long: -100%, Short: +100%). The scheduler checks hourly for expired options.';
