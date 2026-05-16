-- Fresh rebuild compatibility for 141_performance_optimization_indexes.sql.
-- Migration 141 was written against an older trades.status column. The current
-- model derives open/closed state from exit fields, and migration 173 adds the
-- repaired indexes. Add a temporary column only so fresh rebuilds can replay 141.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM migrations
    WHERE filename = '141_performance_optimization_indexes.sql'
  ) THEN
    ALTER TABLE trades ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open';

    UPDATE trades
    SET status = CASE
      WHEN exit_price IS NOT NULL OR exit_time IS NOT NULL THEN 'closed'
      ELSE 'open'
    END
    WHERE status IS NULL OR status NOT IN ('open', 'closed');
  END IF;
END $$;
