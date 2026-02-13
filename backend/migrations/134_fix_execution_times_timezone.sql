-- Migration: Fix execution times to be stored in UTC
-- This migration converts execution times (entryTime, exitTime, datetime)
-- from local time (without timezone) to UTC using each user's timezone setting

-- Create a function to convert local datetime strings to UTC
CREATE OR REPLACE FUNCTION convert_local_to_utc(datetime_str TEXT, user_timezone TEXT)
RETURNS TEXT AS $$
DECLARE
    result_ts TIMESTAMPTZ;
    result_str TEXT;
BEGIN
    -- Return NULL for NULL input
    IF datetime_str IS NULL OR datetime_str = '' THEN
        RETURN datetime_str;
    END IF;

    -- If already has timezone indicator (Z or +/-offset), return as-is
    IF datetime_str LIKE '%Z' OR datetime_str ~ '[+-]\d{2}:\d{2}$' OR datetime_str ~ '[+-]\d{2}\d{2}$' THEN
        RETURN datetime_str;
    END IF;

    -- Default timezone to UTC if not provided
    IF user_timezone IS NULL OR user_timezone = '' THEN
        user_timezone := 'UTC';
    END IF;

    BEGIN
        -- Parse the datetime string as if it were in the user's timezone
        -- Then convert to UTC
        result_ts := (datetime_str::TIMESTAMP AT TIME ZONE user_timezone) AT TIME ZONE 'UTC';

        -- Format as ISO 8601 with Z suffix
        result_str := TO_CHAR(result_ts, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

        RETURN result_str;
    EXCEPTION WHEN OTHERS THEN
        -- If parsing fails, return original string
        RAISE NOTICE 'Failed to convert datetime: %, error: %', datetime_str, SQLERRM;
        RETURN datetime_str;
    END;
END;
$$ LANGUAGE plpgsql;

-- Create a function to fix all execution times in a JSONB array
CREATE OR REPLACE FUNCTION fix_execution_times(executions JSONB, user_timezone TEXT)
RETURNS JSONB AS $$
DECLARE
    result JSONB := '[]'::JSONB;
    exec_item JSONB;
    fixed_item JSONB;
    entry_time TEXT;
    exit_time TEXT;
    datetime_val TEXT;
BEGIN
    -- Return empty array for NULL input
    IF executions IS NULL THEN
        RETURN '[]'::JSONB;
    END IF;

    -- Process each execution in the array
    FOR exec_item IN SELECT * FROM jsonb_array_elements(executions)
    LOOP
        fixed_item := exec_item;

        -- Fix entryTime if present
        entry_time := exec_item->>'entryTime';
        IF entry_time IS NOT NULL AND entry_time != '' THEN
            fixed_item := jsonb_set(fixed_item, '{entryTime}', to_jsonb(convert_local_to_utc(entry_time, user_timezone)));
        END IF;

        -- Fix exitTime if present
        exit_time := exec_item->>'exitTime';
        IF exit_time IS NOT NULL AND exit_time != '' THEN
            fixed_item := jsonb_set(fixed_item, '{exitTime}', to_jsonb(convert_local_to_utc(exit_time, user_timezone)));
        END IF;

        -- Fix datetime if present
        datetime_val := exec_item->>'datetime';
        IF datetime_val IS NOT NULL AND datetime_val != '' THEN
            fixed_item := jsonb_set(fixed_item, '{datetime}', to_jsonb(convert_local_to_utc(datetime_val, user_timezone)));
        END IF;

        -- Fix entry_time (snake_case variant) if present
        entry_time := exec_item->>'entry_time';
        IF entry_time IS NOT NULL AND entry_time != '' THEN
            fixed_item := jsonb_set(fixed_item, '{entry_time}', to_jsonb(convert_local_to_utc(entry_time, user_timezone)));
        END IF;

        -- Fix exit_time (snake_case variant) if present
        exit_time := exec_item->>'exit_time';
        IF exit_time IS NOT NULL AND exit_time != '' THEN
            fixed_item := jsonb_set(fixed_item, '{exit_time}', to_jsonb(convert_local_to_utc(exit_time, user_timezone)));
        END IF;

        result := result || jsonb_build_array(fixed_item);
    END LOOP;

    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Update all trades with executions that need fixing
-- Only update where executions exist and have times without timezone
UPDATE trades t
SET executions = fix_execution_times(t.executions, COALESCE(u.timezone, 'UTC'))
FROM users u
WHERE t.user_id = u.id
  AND t.executions IS NOT NULL
  AND jsonb_array_length(t.executions) > 0
  AND (
    -- Check if any execution has a time field without timezone indicator
    EXISTS (
      SELECT 1 FROM jsonb_array_elements(t.executions) AS exec
      WHERE (
        (exec->>'entryTime' IS NOT NULL AND exec->>'entryTime' != '' AND exec->>'entryTime' NOT LIKE '%Z' AND exec->>'entryTime' !~ '[+-]\d{2}:\d{2}$')
        OR (exec->>'exitTime' IS NOT NULL AND exec->>'exitTime' != '' AND exec->>'exitTime' NOT LIKE '%Z' AND exec->>'exitTime' !~ '[+-]\d{2}:\d{2}$')
        OR (exec->>'datetime' IS NOT NULL AND exec->>'datetime' != '' AND exec->>'datetime' NOT LIKE '%Z' AND exec->>'datetime' !~ '[+-]\d{2}:\d{2}$')
        OR (exec->>'entry_time' IS NOT NULL AND exec->>'entry_time' != '' AND exec->>'entry_time' NOT LIKE '%Z' AND exec->>'entry_time' !~ '[+-]\d{2}:\d{2}$')
        OR (exec->>'exit_time' IS NOT NULL AND exec->>'exit_time' != '' AND exec->>'exit_time' NOT LIKE '%Z' AND exec->>'exit_time' !~ '[+-]\d{2}:\d{2}$')
      )
    )
  );

-- Log how many trades were affected
DO $$
DECLARE
    affected_count INTEGER;
BEGIN
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RAISE NOTICE 'Fixed execution times for % trades', affected_count;
END $$;

-- Clean up the helper functions (optional - keep them if you want to use them later)
-- DROP FUNCTION IF EXISTS convert_local_to_utc(TEXT, TEXT);
-- DROP FUNCTION IF EXISTS fix_execution_times(JSONB, TEXT);

-- Add a comment to document this migration
COMMENT ON TABLE trades IS 'Execution times in the executions JSONB field are now stored in UTC (ISO 8601 format with Z suffix)';
