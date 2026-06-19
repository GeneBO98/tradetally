-- Migration: Reconcile finnhub_usage_minute_metrics schema drift
-- Purpose: On instances where this table predated migration 204, the
--   `CREATE TABLE IF NOT EXISTS` in 204 silently did nothing, leaving the old
--   shape: no `source` column and a 2-column UNIQUE (minute_bucket, endpoint).
--   The application writes `source` and does ON CONFLICT (minute_bucket,
--   endpoint, source), so every insert failed silently for ~25h.
--
-- This migration converges any such drifted table to migration 204's intended
-- shape. It is fully idempotent — a no-op on DBs already matching 204.

ALTER TABLE IF EXISTS finnhub_usage_minute_metrics
  ADD COLUMN IF NOT EXISTS source VARCHAR(120) NOT NULL DEFAULT 'unknown';

DO $$
BEGIN
  IF to_regclass('public.finnhub_usage_minute_metrics') IS NULL THEN
    RETURN; -- table not present on this instance; nothing to reconcile
  END IF;

  -- Drop the legacy 2-column unique constraint if it exists
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'unique_finnhub_usage_minute_endpoint'
      AND conrelid = 'public.finnhub_usage_minute_metrics'::regclass
  ) THEN
    ALTER TABLE finnhub_usage_minute_metrics
      DROP CONSTRAINT unique_finnhub_usage_minute_endpoint;
  END IF;

  -- Add the correct 3-column unique constraint (matches the app's ON CONFLICT)
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.finnhub_usage_minute_metrics'::regclass
      AND contype = 'u'
      AND conname = 'finnhub_usage_minute_metrics_unique'
  ) THEN
    ALTER TABLE finnhub_usage_minute_metrics
      ADD CONSTRAINT finnhub_usage_minute_metrics_unique
      UNIQUE (minute_bucket, endpoint, source);
  END IF;
END$$;
