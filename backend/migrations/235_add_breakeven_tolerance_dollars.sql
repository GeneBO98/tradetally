-- Allow users to classify trades within a fixed gross-P&L amount as breakeven.
-- Existing users remain on tick-based tolerance unless they explicitly switch.

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS breakeven_tolerance_mode VARCHAR(10) NOT NULL DEFAULT 'ticks',
ADD COLUMN IF NOT EXISTS breakeven_tolerance_dollars NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE user_settings
DROP CONSTRAINT IF EXISTS user_settings_breakeven_tolerance_mode_check;

ALTER TABLE user_settings
ADD CONSTRAINT user_settings_breakeven_tolerance_mode_check
CHECK (breakeven_tolerance_mode IN ('ticks', 'dollars'));

ALTER TABLE user_settings
DROP CONSTRAINT IF EXISTS user_settings_breakeven_tolerance_dollars_check;

ALTER TABLE user_settings
ADD CONSTRAINT user_settings_breakeven_tolerance_dollars_check
CHECK (breakeven_tolerance_dollars >= 0);

COMMENT ON COLUMN user_settings.breakeven_tolerance_mode IS 'Unit used for breakeven classification: ticks or dollars. Existing users default to ticks.';
COMMENT ON COLUMN user_settings.breakeven_tolerance_dollars IS 'Trades whose gross P&L is within this fixed amount of zero count as breakeven when breakeven_tolerance_mode is dollars.';
