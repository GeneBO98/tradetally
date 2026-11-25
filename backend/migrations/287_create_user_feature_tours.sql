-- New-feature tours
--
-- Created with IF NOT EXISTS so installs that already have this table from
-- another migration file are unaffected.
--
-- One row per user per feature tour once the user finishes or dismisses it,
-- so the "What's new" prompt never shows that tour to them again on any
-- device. Tours themselves are defined in frontend/src/constants/featureTours.js;
-- tour_id is that registry's id (e.g. '2026-11-whatif-wrapup').

CREATE TABLE IF NOT EXISTS user_feature_tours (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tour_id VARCHAR(64) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('completed', 'dismissed')),
  last_step INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tour_id)
);

CREATE INDEX IF NOT EXISTS idx_user_feature_tours_tour_status
  ON user_feature_tours(tour_id, status);

COMMENT ON TABLE user_feature_tours IS 'Which new-feature tours each user has completed or dismissed; rows suppress the tour prompt for that user.';
