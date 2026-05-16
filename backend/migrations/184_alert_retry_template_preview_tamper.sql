BEGIN;

ALTER TABLE operational_alert_escalation_deliveries
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_alert_escalation_deliveries_retry
  ON operational_alert_escalation_deliveries(status, next_retry_at)
  WHERE status IN ('failed', 'skipped');

COMMIT;
