BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM migrations
    WHERE filename = '106_add_instrument_to_broker_fees.sql'
  ) THEN
    ALTER TABLE broker_fee_settings
      DROP CONSTRAINT IF EXISTS broker_fee_settings_user_id_broker_instrument_key;
  END IF;
END $$;

COMMIT;
