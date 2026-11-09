-- Optional intraday confirmations. Existing Activity cursors and schedules are untouched.
ALTER TABLE broker_connections
  ADD COLUMN IF NOT EXISTS ibkr_trade_confirmation_query_id TEXT,
  ADD COLUMN IF NOT EXISTS ibkr_next_confirmation_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ibkr_last_confirmation_sync_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS broker_connections_confirmation_due_idx
  ON broker_connections (ibkr_next_confirmation_sync_at)
  WHERE broker_type = 'ibkr' AND ibkr_trade_confirmation_query_id IS NOT NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS ibkr_reconciliation_status TEXT
  CHECK (ibkr_reconciliation_status IN ('pending', 'reconciled', 'needs_review'));
ALTER TABLE broker_sync_logs DROP CONSTRAINT IF EXISTS broker_sync_logs_sync_type_check;
ALTER TABLE broker_sync_logs ADD CONSTRAINT broker_sync_logs_sync_type_check
  CHECK (sync_type IN ('manual', 'scheduled', 'retry', 'ibkr_timeout_retry', 'ibkr_confirmation'));

-- Derive status for every write path, including CSV imports and execution updates.
CREATE OR REPLACE FUNCTION set_ibkr_reconciliation_status() RETURNS trigger AS $$
BEGIN
  IF jsonb_typeof(NEW.executions) = 'array' THEN
    SELECT CASE
      WHEN bool_or(e->>'ibkr_needs_review' = 'true') THEN 'needs_review'
      WHEN bool_or(e->>'ibkr_report_type' = 'trade_confirmation') THEN 'pending'
      WHEN bool_or(e->>'ibkr_report_type' = 'activity') THEN 'reconciled'
      ELSE NULL END INTO NEW.ibkr_reconciliation_status
    FROM jsonb_array_elements(NEW.executions) e;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trades_ibkr_reconciliation_status ON trades;
CREATE TRIGGER trades_ibkr_reconciliation_status BEFORE INSERT OR UPDATE OF executions
  ON trades FOR EACH ROW EXECUTE FUNCTION set_ibkr_reconciliation_status();
