-- Script to drop all data from TradeTally database while preserving schema
-- WARNING: This will DELETE ALL DATA permanently!

BEGIN;

-- Disable foreign key checks temporarily
SET session_replication_role = 'replica';

-- Get all table names and truncate them
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Truncate all tables in public schema
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')
    LOOP
        EXECUTE 'TRUNCATE TABLE ' || quote_ident(r.tablename) || ' CASCADE';
        RAISE NOTICE 'Truncated table: %', r.tablename;
    END LOOP;

    -- Reset all sequences
    FOR r IN (SELECT sequence_name FROM information_schema.sequences WHERE sequence_schema = 'public')
    LOOP
        EXECUTE 'ALTER SEQUENCE ' || quote_ident(r.sequence_name) || ' RESTART WITH 1';
        RAISE NOTICE 'Reset sequence: %', r.sequence_name;
    END LOOP;
END $$;

-- Re-enable foreign key checks
SET session_replication_role = 'origin';

-- Verify tables are empty
DO $$
DECLARE
    r RECORD;
    row_count INTEGER;
BEGIN
    RAISE NOTICE '=== Verifying all tables are empty ===';
    FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename)
    LOOP
        EXECUTE 'SELECT COUNT(*) FROM ' || quote_ident(r.tablename) INTO row_count;
        RAISE NOTICE 'Table % has % rows', r.tablename, row_count;
    END LOOP;
END $$;

COMMIT;

-- Summary
SELECT
    'Data cleanup complete' as status,
    COUNT(*) as total_tables,
    'All tables truncated' as result
FROM pg_tables
WHERE schemaname = 'public';