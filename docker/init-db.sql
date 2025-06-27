-- Check if database exists and only create if it doesn't
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tradetally') THEN
        PERFORM dblink_exec('dbname=postgres', 'CREATE DATABASE tradetally');
    END IF;
END
$$;