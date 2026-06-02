-- Add a per-user breakeven tolerance (in ticks) to user settings.
-- A trade counts as breakeven when its GROSS P&L (price only, excluding
-- commissions/fees) is within this many ticks of zero, scaled per-instrument by
-- tick_size x point_value x quantity. 0 = exact gross breakeven only (default),
-- which preserves existing behavior unless a user opts in.

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS breakeven_tolerance_ticks NUMERIC(10,4) DEFAULT 0;

COMMENT ON COLUMN user_settings.breakeven_tolerance_ticks IS 'Trades whose gross P&L is within this many ticks (scaled per-instrument by tick_size * point_value * quantity) count as breakeven. 0 = exact gross breakeven only.';
