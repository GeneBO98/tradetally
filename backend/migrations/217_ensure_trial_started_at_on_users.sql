-- Ensure users.trial_used AND users.trial_started_at both exist.
--
-- User.findById SELECTs trial_used and trial_started_at on every authenticated
-- request. trial_started_at was only ever added by migration 185, but 185 also
-- runs `UPDATE users SET trial_used = ...` before any migration creates
-- trial_used. The migration runner wraps each file in a single PL/pgSQL block
-- with an `undefined_column` handler, so on a database without trial_used that
-- UPDATE raises, the handler fires, and the ENTIRE block -- including the
-- trial_started_at ADD COLUMN earlier in the same block -- is rolled back while
-- 185 is still recorded as applied. The result is a database missing
-- trial_started_at (and, before migration 216, trial_used too), which breaks
-- authentication with `column "trial_started_at" does not exist`.
--
-- This migration adds both columns idempotently and backfills them from
-- existing trial overrides. It only references columns it has already created
-- in this same block, so it cannot fail the way 185 did.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

WITH existing_trials AS (
  SELECT
    user_id,
    MIN(created_at) AS first_trial_started_at
  FROM tier_overrides
  WHERE reason ILIKE '%trial%'
  GROUP BY user_id
)
UPDATE users u
SET
  trial_used = TRUE,
  trial_started_at = COALESCE(u.trial_started_at, et.first_trial_started_at),
  updated_at = CURRENT_TIMESTAMP
FROM existing_trials et
WHERE u.id = et.user_id
  AND (
    u.trial_used IS DISTINCT FROM TRUE
    OR u.trial_started_at IS NULL
  );
