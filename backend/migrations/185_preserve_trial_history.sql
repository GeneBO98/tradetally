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
  trial_used = true,
  trial_started_at = COALESCE(u.trial_started_at, et.first_trial_started_at),
  updated_at = CURRENT_TIMESTAMP
FROM existing_trials et
WHERE u.id = et.user_id
  AND (
    u.trial_used IS DISTINCT FROM true
    OR u.trial_started_at IS NULL
  );

CREATE OR REPLACE FUNCTION public.set_trial_used_on_insert()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.reason ILIKE '%trial%' THEN
        UPDATE users
        SET trial_used = true,
            trial_started_at = COALESCE(trial_started_at, NEW.created_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.user_id;

        RAISE NOTICE 'Persisted trial history for user % after creating trial override', NEW.user_id;
    END IF;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reset_trial_used_on_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF OLD.reason ILIKE '%trial%' THEN
        RAISE NOTICE 'Preserved trial history for user % after deleting trial override', OLD.user_id;
    END IF;

    RETURN OLD;
END;
$function$;
