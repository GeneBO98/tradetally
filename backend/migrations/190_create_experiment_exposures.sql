-- Tracks GrowthBook experiment exposures for SQL-based analysis.
-- Uses a varchar anonymous_id (not a FK) so both logged-in and anonymous
-- users can be recorded. user_id is populated when the user is identified.
CREATE TABLE IF NOT EXISTS experiment_exposures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  anonymous_id     VARCHAR(255) NOT NULL,
  user_id          UUID,
  experiment_id    VARCHAR(255) NOT NULL,
  variation_id     VARCHAR(50)  NOT NULL,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_exp_exposures_experiment
  ON experiment_exposures (experiment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exp_exposures_user
  ON experiment_exposures (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exp_exposures_anon
  ON experiment_exposures (anonymous_id, created_at DESC);

-- Prevent duplicate exposures for the same user+experiment combination
CREATE UNIQUE INDEX IF NOT EXISTS idx_exp_exposures_unique
  ON experiment_exposures (anonymous_id, experiment_id);
