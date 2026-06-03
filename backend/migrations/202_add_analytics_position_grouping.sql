-- Whole-trade win rate (issue #339)
-- When enabled, analytics group multi-leg positions (e.g. option spreads) that
-- were opened together into a single trade, so win rate, trade counts, and
-- related stats are measured per position instead of per individual leg.
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS analytics_position_grouping BOOLEAN DEFAULT false;

COMMENT ON COLUMN user_settings.analytics_position_grouping IS 'When true, analytics group legs sharing the same account + underlying + entry_time into one trade so win rate is measured per position instead of per leg (issue #339).';
