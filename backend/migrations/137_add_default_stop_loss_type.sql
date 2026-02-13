-- Add default stop loss type setting to user_settings table
-- This allows users to choose between percentage-based or Low of Day (LoD) stop loss
-- 'percent' = use default_stop_loss_percent (existing behavior)
-- 'lod' = use Low of Day at entry time (for Qullamaggie-style swing trades)

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS default_stop_loss_type VARCHAR(20) DEFAULT 'percent';

COMMENT ON COLUMN user_settings.default_stop_loss_type IS 'Default stop loss type: "percent" for percentage-based, "lod" for Low of Day at entry time';
