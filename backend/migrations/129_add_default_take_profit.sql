-- Add default take profit percentage setting to user_settings table
-- This allows users to set a standard take profit that applies to all new trades

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS default_take_profit_percent DECIMAL(5,2);

COMMENT ON COLUMN user_settings.default_take_profit_percent IS 'Default take profit percentage to apply to all new trades (e.g., 6.0 for 6%)';
