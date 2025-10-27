-- Add default stop loss percentage setting to user_settings table
-- This allows users to set a standard stop loss that applies to all new trades

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS default_stop_loss_percent DECIMAL(5,2);

COMMENT ON COLUMN user_settings.default_stop_loss_percent IS 'Default stop loss percentage to apply to all new trades (e.g., 2.0 for 2%)';
