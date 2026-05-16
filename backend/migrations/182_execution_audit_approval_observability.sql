BEGIN;

ALTER TABLE execution_run_events
  ADD COLUMN IF NOT EXISTS previous_event_hash TEXT,
  ADD COLUMN IF NOT EXISTS event_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_execution_run_events_hash
  ON execution_run_events(run_id, created_at, event_hash);

CREATE TABLE IF NOT EXISTS execution_run_share_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('share', 'rotate', 'unshare', 'revoke')),
  token_hash TEXT,
  previous_token_hash TEXT,
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  recipient TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_run_share_audits_run_created
  ON execution_run_share_audits(run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS execution_workflow_setting_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  before_settings JSONB NOT NULL,
  after_settings JSONB NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'applied')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_execution_workflow_setting_revisions_source_requested
  ON execution_workflow_setting_revisions(source, requested_at DESC);

CREATE TABLE IF NOT EXISTS execution_strategy_anomaly_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'trade-management',
  strategy TEXT NOT NULL,
  shared_report_access_threshold INTEGER NOT NULL CHECK (shared_report_access_threshold BETWEEN 2 AND 10000),
  shared_report_access_window_minutes INTEGER NOT NULL CHECK (shared_report_access_window_minutes BETWEEN 1 AND 10080),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (source, strategy)
);

CREATE TABLE IF NOT EXISTS operational_alert_suppression_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  recurrence_rule JSONB NOT NULL DEFAULT '{}'::jsonb,
  reason TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_suppression_rules_alert
  ON operational_alert_suppression_rules(alert_type, entity_type, entity_id, is_enabled);

CREATE TABLE IF NOT EXISTS operational_alert_escalation_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_type TEXT NOT NULL CHECK (destination_type IN ('email', 'slack', 'webhook')),
  target TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_escalation_destinations_enabled
  ON operational_alert_escalation_destinations(is_enabled, severity, destination_type);

CREATE TABLE IF NOT EXISTS execution_db_query_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_key TEXT NOT NULL,
  query_label TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_db_query_measurements_key_created
  ON execution_db_query_measurements(endpoint_key, created_at DESC);

COMMIT;
