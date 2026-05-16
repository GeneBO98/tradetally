BEGIN;

ALTER TABLE operational_alert_delivery_replay_requests
  ADD COLUMN IF NOT EXISTS review_note TEXT;

CREATE INDEX IF NOT EXISTS idx_alert_delivery_replay_requests_reviewed
  ON operational_alert_delivery_replay_requests(status, reviewed_at DESC);

CREATE TABLE IF NOT EXISTS import_account_reconciliation_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL REFERENCES import_account_reconciliations(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('resolve', 'ignore', 'reopen', 'rollback')),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  bulk_action_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_import_reconciliation_audits_reconciliation
  ON import_account_reconciliation_audits(reconciliation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_reconciliation_audits_bulk
  ON import_account_reconciliation_audits(bulk_action_id, created_at DESC)
  WHERE bulk_action_id IS NOT NULL;

COMMIT;
