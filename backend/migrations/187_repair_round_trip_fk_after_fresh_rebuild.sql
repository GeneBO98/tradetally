BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'round_trip_trades'
  )
  AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'trades' AND column_name = 'round_trip_id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'trades_round_trip_id_fkey'
  ) THEN
    ALTER TABLE trades
      ADD CONSTRAINT trades_round_trip_id_fkey
      FOREIGN KEY (round_trip_id)
      REFERENCES round_trip_trades(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMIT;
