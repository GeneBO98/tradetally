-- Add default stop loss dollar amount setting to user_settings table
-- Used when default_stop_loss_type is 'dollar' - fixed risk per trade in dollars (e.g., $100, $150)

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS default_stop_loss_dollars DECIMAL(10,2);

COMMENT ON COLUMN user_settings.default_stop_loss_dollars IS 'Default stop loss in dollars per trade when type is dollar (e.g., 100.00 for $100 risk per trade)';

-- Update comment on type column to include dollar option
COMMENT ON COLUMN user_settings.default_stop_loss_type IS 'Default stop loss type: "percent" for percentage-based, "lod" for Low of Day at entry time, "dollar" for fixed dollar amount per trade';
