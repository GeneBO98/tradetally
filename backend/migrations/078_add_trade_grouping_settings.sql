-- Migration: Add trade grouping settings to user_settings table
-- Adds ability for users to control how executions are grouped into trades

-- Add trade grouping enabled flag (default true to maintain current behavior)
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS enable_trade_grouping BOOLEAN DEFAULT true;

-- Add configurable time gap for grouping executions (in minutes)
-- Default 60 minutes (1 hour) following TradeSviz best practice
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS trade_grouping_time_gap_minutes INTEGER DEFAULT 60;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_user_settings_trade_grouping
ON user_settings(user_id, enable_trade_grouping, trade_grouping_time_gap_minutes);

-- Add comments for documentation
COMMENT ON COLUMN user_settings.enable_trade_grouping IS 'When enabled, executions within the time gap are grouped into single trades';
COMMENT ON COLUMN user_settings.trade_grouping_time_gap_minutes IS 'Maximum time gap (in minutes) between executions to group them into same trade. Default 60 minutes (TradeSviz standard)';
