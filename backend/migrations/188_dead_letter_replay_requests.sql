BEGIN;

CREATE TABLE IF NOT EXISTS operational_alert_delivery_replay_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id UUID NOT NULL REFERENCES operational_alert_escalation_deliveries(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'rejected', 'applied')),
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_delivery_id UUID REFERENCES operational_alert_escalation_deliveries(id) ON DELETE SET NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_delivery_replay_requests_status
  ON operational_alert_delivery_replay_requests(status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_delivery_replay_requests_delivery
  ON operational_alert_delivery_replay_requests(delivery_id, requested_at DESC);

COMMIT;
