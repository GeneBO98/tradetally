-- Add a personality score bucket for grouped option strategies.
-- Existing profiles were generated before option structures were recognized,
-- so remove stored profile rows and let users regenerate under the new model.

ALTER TABLE trading_personality_profiles
ADD COLUMN IF NOT EXISTS option_strategy_score INTEGER DEFAULT 0;

DELETE FROM trading_personality_profiles;
