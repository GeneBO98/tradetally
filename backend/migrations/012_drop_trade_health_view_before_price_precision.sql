BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM migrations
    WHERE filename = '013_increase_price_precision.sql'
  ) THEN
    DROP VIEW IF EXISTS trades_with_health_analytics CASCADE;
  END IF;
END $$;

COMMIT;
