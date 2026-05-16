BEGIN;

ALTER TABLE operational_alert_escalation_destinations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_alert_escalation_destinations_active
  ON operational_alert_escalation_destinations(is_enabled, severity, destination_type)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS operational_alert_escalation_destination_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID REFERENCES operational_alert_escalation_destinations(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'enable', 'disable', 'delete')),
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_escalation_destination_audits_destination
  ON operational_alert_escalation_destination_audits(destination_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_escalation_destination_audits_actor
  ON operational_alert_escalation_destination_audits(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_escalation_deliveries_due_retry
  ON operational_alert_escalation_deliveries(next_retry_at, attempted_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

COMMIT;
