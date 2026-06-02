-- Snapshot table for the canonical pnlEngine backfill.
-- The backfill (backend/scripts/backfill-pnl-engine.js) inserts the pre-migration
-- values for every trade it touches BEFORE issuing the UPDATE, so a --rollback
-- pass can restore them if the new computation is found to be wrong.
--
-- The status table tracks whether the backfill has completed for this database,
-- so docker-entrypoint.sh can run it once and then skip on subsequent restarts.

CREATE TABLE IF NOT EXISTS pnl_engine_backfill_backup (
  trade_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  pnl NUMERIC,
  pnl_percent NUMERIC,
  commission NUMERIC,
  fees NUMERIC,
  entry_price NUMERIC,
  exit_price NUMERIC,
  entry_time TIMESTAMPTZ,
  exit_time TIMESTAMPTZ,
  trade_date DATE,
  quantity NUMERIC,
  executions JSONB,
  backed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pnl_engine_backfill_backup_user_id
  ON pnl_engine_backfill_backup (user_id);

CREATE TABLE IF NOT EXISTS pnl_engine_backfill_status (
  id INT PRIMARY KEY DEFAULT 1,
  applied_at TIMESTAMPTZ,
  trades_updated INT DEFAULT 0,
  notes TEXT,
  CONSTRAINT pnl_engine_backfill_status_singleton CHECK (id = 1)
);

INSERT INTO pnl_engine_backfill_status (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
