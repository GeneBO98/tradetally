-- Existing future daily schedules were calculated in the backend process
-- timezone. Recalculate them once in each user's configured timezone so the
-- fix applies immediately after deployment. Already-due schedules are left
-- untouched so the scheduler can process the missed run normally.

WITH daily_connections AS (
    SELECT
        bc.id,
        bc.sync_time,
        CASE
            WHEN available_timezone.name IS NOT NULL
                THEN COALESCE(NULLIF(users.timezone, ''), 'UTC')
            ELSE 'UTC'
        END AS user_timezone
    FROM broker_connections AS bc
    JOIN users ON users.id = bc.user_id
    LEFT JOIN pg_timezone_names AS available_timezone
        ON available_timezone.name = COALESCE(NULLIF(users.timezone, ''), 'UTC')
    WHERE bc.auto_sync_enabled = TRUE
      AND bc.sync_frequency = 'daily'
      AND bc.sync_time IS NOT NULL
      AND bc.next_scheduled_sync > CURRENT_TIMESTAMP
), candidate_times AS (
    SELECT
        id,
        sync_time,
        user_timezone,
        (
            (CURRENT_TIMESTAMP AT TIME ZONE user_timezone)::date + sync_time
        ) AT TIME ZONE user_timezone AS today_sync
    FROM daily_connections
)
UPDATE broker_connections AS bc
SET next_scheduled_sync = CASE
        WHEN candidate_times.today_sync > CURRENT_TIMESTAMP
            THEN candidate_times.today_sync
        ELSE (
            ((CURRENT_TIMESTAMP AT TIME ZONE candidate_times.user_timezone)::date + 1)
            + candidate_times.sync_time
        ) AT TIME ZONE candidate_times.user_timezone
    END,
    updated_at = CURRENT_TIMESTAMP
FROM candidate_times
WHERE bc.id = candidate_times.id;
