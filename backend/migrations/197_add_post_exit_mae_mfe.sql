-- Track after-trade MAE/MFE separately from in-trade MAE/MFE.
-- Existing trades.mae and trades.mfe remain entry-to-exit metrics.

ALTER TABLE trades
ADD COLUMN IF NOT EXISTS post_exit_mae DECIMAL(20, 8) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS post_exit_mfe DECIMAL(20, 8) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS post_exit_window_override_minutes INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS post_exit_window_minutes INTEGER DEFAULT NULL,
ADD COLUMN IF NOT EXISTS post_exit_window_source VARCHAR(30) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS post_exit_window_end TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS post_exit_calculated_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS post_exit_excursion_window_mode VARCHAR(20) DEFAULT 'auto',
ADD COLUMN IF NOT EXISTS post_exit_excursion_window_minutes INTEGER DEFAULT NULL;

COMMENT ON COLUMN trades.post_exit_mae IS 'Maximum Adverse Excursion from entry through the configured post-exit window';
COMMENT ON COLUMN trades.post_exit_mfe IS 'Maximum Favorable Excursion from entry through the configured post-exit window';
COMMENT ON COLUMN trades.post_exit_window_override_minutes IS 'Optional per-trade override for after-trade MAE/MFE tracking window';
COMMENT ON COLUMN trades.post_exit_window_minutes IS 'Resolved post-exit tracking window in minutes';
COMMENT ON COLUMN trades.post_exit_window_source IS 'Source used to resolve the post-exit tracking window';
COMMENT ON COLUMN trades.post_exit_window_end IS 'Timestamp where the post-exit MAE/MFE tracking window ends';
COMMENT ON COLUMN trades.post_exit_calculated_at IS 'Timestamp when post-exit MAE/MFE was last calculated';

COMMENT ON COLUMN user_settings.post_exit_excursion_window_mode IS 'User default for after-trade excursion window: auto or manual';
COMMENT ON COLUMN user_settings.post_exit_excursion_window_minutes IS 'Manual user default after-trade excursion window in minutes';
