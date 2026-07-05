-- Repair Lightspeed execution times stored during Eastern STANDARD time.
--
-- The Lightspeed CSV parser (added 2025-07-23) converted the file's Eastern
-- wall-clock times to UTC with a hard-coded +4 hour offset. That offset is
-- only correct during daylight saving; for trades dated November-March the
-- true offset is +5, so every such trade was stored one hour early. The
-- parser now converts via America/New_York with proper DST handling; this
-- migration shifts the already-imported rows forward by the missing hour.
--
-- Scope: broker='lightspeed' rows created since the buggy parser landed,
-- whose (corrected) moment falls in EST. Entry/exit columns and the
-- executions JSONB datetimes shift together in one statement.
--
-- WARNING: NOT idempotent. Corrected rows still satisfy the WHERE clause
-- (an EST-season trade is in EST either way), so re-running this statement
-- would shift times a second hour. It must run exactly once; run-once is
-- guaranteed by the migration tracker, so never re-apply it manually.

UPDATE trades
SET
  entry_time = entry_time + interval '1 hour',
  exit_time = CASE WHEN exit_time IS NOT NULL THEN exit_time + interval '1 hour' END,
  executions = CASE
    WHEN jsonb_typeof(executions) = 'array' THEN COALESCE(
      (
        SELECT jsonb_agg(
          CASE
            WHEN elem ? 'datetime' AND elem->>'datetime' IS NOT NULL
                 AND (elem->>'datetime') ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' THEN
              jsonb_set(
                elem,
                '{datetime}',
                -- execution datetimes are UTC wall-clock strings (with or
                -- without a Z suffix); ::timestamp keeps the wall clock either way
                to_jsonb(to_char((elem->>'datetime')::timestamp + interval '1 hour',
                                 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
              )
            ELSE elem
          END
          ORDER BY ordinality
        )
        FROM jsonb_array_elements(trades.executions) WITH ORDINALITY AS exec_rows(elem, ordinality)
      ),
      trades.executions
    )
    ELSE executions
  END,
  updated_at = NOW()
WHERE broker = 'lightspeed'
  AND created_at >= '2025-07-23'
  AND entry_time IS NOT NULL
  AND entry_time >= '2000-01-01'
  AND ((entry_time + interval '1 hour') AT TIME ZONE 'UTC')
    - ((entry_time + interval '1 hour') AT TIME ZONE 'America/New_York') = interval '5 hours';

DELETE FROM analytics_cache;
