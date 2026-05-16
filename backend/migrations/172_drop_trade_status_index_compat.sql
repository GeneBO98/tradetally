-- Remove the temporary trades.status compatibility column before the repaired
-- performance indexes in migration 173. Existing databases that already passed
-- 173 skip this block.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM migrations
    WHERE filename = '173_repair_sync_performance_indexes.sql'
  ) THEN
    DROP INDEX IF EXISTS idx_trades_user_date_status_pnl;
    DROP INDEX IF EXISTS idx_trades_user_status_symbol;
    ALTER TABLE trades DROP COLUMN IF EXISTS status;
  END IF;
END $$;
