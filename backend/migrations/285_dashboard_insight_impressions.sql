-- Migration 285: Dashboard insight impressions
--
-- The dashboard insight card used to show the same evergreen insight (for
-- example "Your scalper setup is working") for months because nothing
-- remembered how long it had been on screen. Each insight now carries a
-- stable key, and this table records when a key was first and last shown
-- to a user so the rotation layer can retire it after its TTL and bring it
-- back only after a cooldown.
--
-- Every statement is idempotent and none can raise the exceptions the
-- migration runner swallows, so the whole file applies or nothing does.

CREATE TABLE IF NOT EXISTS dashboard_insight_impressions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  insight_key VARCHAR(200) NOT NULL,
  first_shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_shown_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, insight_key)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_insight_impressions_last_shown
  ON dashboard_insight_impressions (last_shown_at);
