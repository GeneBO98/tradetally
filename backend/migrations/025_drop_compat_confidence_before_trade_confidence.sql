BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM migrations
    WHERE filename = '026_add_trade_confidence_field.sql'
  ) THEN
    DROP VIEW IF EXISTS trades_with_health_analytics CASCADE;
    ALTER TABLE trades DROP COLUMN IF EXISTS confidence;
  END IF;
END $$;

COMMIT;
