-- Migration: Resync all SERIAL/identity sequences with existing rows
-- Created: 2026-09-15
-- Purpose: Backup restores re-insert rows with explicit ids (backup.service.js)
-- without advancing table sequences. The next application INSERT then generates
-- an already-used id and fails with a duplicate key error on *_pkey (seen with
-- api_usage_tracking_pkey breaking trade chart loading). This idempotent pass
-- sets every serial/identity sequence to the current MAX(id) of its table.

DO $resync$
DECLARE
  rec RECORD;
  max_id BIGINT;
BEGIN
  FOR rec IN
    SELECT c.oid::regclass AS tbl,
           a.attname AS col,
           pg_get_serial_sequence(c.oid::regclass::text, a.attname) AS seq
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE n.nspname = current_schema()
      AND c.relkind = 'r'
      AND t.typname IN ('int2', 'int4', 'int8')
      AND pg_get_serial_sequence(c.oid::regclass::text, a.attname) IS NOT NULL
  LOOP
    EXECUTE format('SELECT MAX(%I) FROM %s', rec.col, rec.tbl) INTO max_id;
    IF max_id IS NOT NULL THEN
      PERFORM setval(rec.seq, max_id, true);
    END IF;
  END LOOP;
END
$resync$;
