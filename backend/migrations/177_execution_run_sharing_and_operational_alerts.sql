-- Add execution-run sharing and operational alerting primitives.

ALTER TABLE execution_runs
ADD COLUMN IF NOT EXISTS share_token VARCHAR(64),
ADD COLUMN IF NOT EXISTS shared_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS share_expires_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_runs_share_token
ON execution_runs(share_token)
WHERE share_token IS NOT NULL;

CREATE TABLE IF NOT EXISTS operational_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning'
    CHECK (severity IN ('info', 'warning', 'critical')),
  status VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved')),
  entity_type VARCHAR(80),
  entity_id UUID,
  message TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_operational_alerts_active_entity
ON operational_alerts(alert_type, entity_type, entity_id)
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_operational_alerts_status_seen
ON operational_alerts(status, last_seen_at DESC);
