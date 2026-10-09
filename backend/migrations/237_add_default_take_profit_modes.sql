-- Allow take-profit defaults to be expressed as a price percentage, an
-- R-multiple of the trade's stop distance, or a fixed dollar profit per trade.

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS default_take_profit_type VARCHAR(20) NOT NULL DEFAULT 'percent',
ADD COLUMN IF NOT EXISTS default_take_profit_r_multiple NUMERIC(8, 2),
ADD COLUMN IF NOT EXISTS default_take_profit_dollars NUMERIC(12, 2);

ALTER TABLE user_settings
DROP CONSTRAINT IF EXISTS user_settings_default_take_profit_type_check;

ALTER TABLE user_settings
ADD CONSTRAINT user_settings_default_take_profit_type_check
CHECK (default_take_profit_type IN ('percent', 'risk_reward', 'dollar'));

ALTER TABLE user_settings
DROP CONSTRAINT IF EXISTS user_settings_default_take_profit_r_multiple_check;

ALTER TABLE user_settings
ADD CONSTRAINT user_settings_default_take_profit_r_multiple_check
CHECK (default_take_profit_r_multiple IS NULL OR default_take_profit_r_multiple >= 0);

ALTER TABLE user_settings
DROP CONSTRAINT IF EXISTS user_settings_default_take_profit_dollars_check;

ALTER TABLE user_settings
ADD CONSTRAINT user_settings_default_take_profit_dollars_check
CHECK (default_take_profit_dollars IS NULL OR default_take_profit_dollars >= 0);

COMMENT ON COLUMN user_settings.default_take_profit_type IS 'Take-profit default mode: percent, risk_reward, or dollar.';
COMMENT ON COLUMN user_settings.default_take_profit_r_multiple IS 'Profit target in risk units, based on the distance from entry to stop loss.';
COMMENT ON COLUMN user_settings.default_take_profit_dollars IS 'Fixed gross dollar profit target per trade.';
