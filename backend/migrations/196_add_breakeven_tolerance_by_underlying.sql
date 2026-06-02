-- Per-instrument breakeven tolerance overrides.
--
-- breakeven_tolerance_ticks (migration 194) is the DEFAULT tolerance applied to
-- every instrument. This adds an optional per-underlying override map so users
-- can set, e.g., 2 ticks on ES but 5 on NQ. Shape:
--   { "ES": 2, "NQ": 5 }
-- Instruments not present in the map fall back to breakeven_tolerance_ticks.

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS breakeven_tolerance_ticks_by_underlying JSONB DEFAULT NULL;

COMMENT ON COLUMN user_settings.breakeven_tolerance_ticks_by_underlying IS 'Optional per-underlying breakeven tolerance overrides in ticks, e.g. {"ES":2,"NQ":5}. Instruments not listed use breakeven_tolerance_ticks.';
