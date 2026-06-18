-- Add persistent trial usage tracking for free trial eligibility.
-- Existing billing code checks users.trial_used and updates it when a trial
-- starts; this column was missing from older self-hosted databases.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS trial_used BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE users u
SET trial_used = TRUE
WHERE EXISTS (
  SELECT 1
  FROM tier_overrides tov
  WHERE tov.user_id = u.id
    AND tov.reason ILIKE '%trial%'
);

CREATE OR REPLACE FUNCTION sync_user_trial_used()
RETURNS TRIGGER AS $$
DECLARE
  affected_user_id UUID;
BEGIN
  UPDATE users
  SET trial_used = EXISTS (
    SELECT 1
    FROM tier_overrides tov
    WHERE tov.user_id = COALESCE(NEW.user_id, OLD.user_id)
      AND tov.reason ILIKE '%trial%'
  )
  WHERE id = COALESCE(NEW.user_id, OLD.user_id);

  IF TG_OP = 'UPDATE' AND OLD.user_id IS DISTINCT FROM NEW.user_id THEN
    affected_user_id := OLD.user_id;

    UPDATE users
    SET trial_used = EXISTS (
      SELECT 1
      FROM tier_overrides tov
      WHERE tov.user_id = affected_user_id
        AND tov.reason ILIKE '%trial%'
    )
    WHERE id = affected_user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_user_trial_used_on_tier_overrides ON tier_overrides;
CREATE TRIGGER sync_user_trial_used_on_tier_overrides
  AFTER INSERT OR UPDATE OR DELETE ON tier_overrides
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_trial_used();

COMMENT ON COLUMN users.trial_used IS 'Tracks whether the user has used a free Pro trial.';
