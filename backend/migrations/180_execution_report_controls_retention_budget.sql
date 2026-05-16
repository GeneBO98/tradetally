BEGIN;

ALTER TABLE execution_runs
  ALTER COLUMN share_token TYPE TEXT;

ALTER TABLE execution_runs
  ADD COLUMN IF NOT EXISTS share_scope JSONB NOT NULL DEFAULT '{"formats":["json"],"includeEvents":true,"includeMetrics":true,"includeReportAccesses":false}'::jsonb;

ALTER TABLE operational_alerts
  ADD COLUMN IF NOT EXISTS suppressed_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suppression_reason TEXT,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_operational_alerts_status_suppressed
  ON operational_alerts(status, suppressed_until, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS execution_retention_policy_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL DEFAULT 'update',
  before_policy JSONB NOT NULL,
  after_policy JSONB NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'applied')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_retention_policy_revisions_policy_requested
  ON execution_retention_policy_revisions(policy_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS execution_performance_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_key TEXT NOT NULL UNIQUE,
  method TEXT NOT NULL,
  path_pattern TEXT NOT NULL,
  budget_ms INTEGER NOT NULL CHECK (budget_ms > 0),
  p95_budget_ms INTEGER NOT NULL CHECK (p95_budget_ms > 0),
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS execution_performance_measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_key TEXT NOT NULL,
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  request_id TEXT,
  status_code INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execution_performance_measurements_key_created
  ON execution_performance_measurements(endpoint_key, created_at DESC);

INSERT INTO execution_performance_budgets (endpoint_key, method, path_pattern, budget_ms, p95_budget_ms)
VALUES
  ('execution.compare', 'GET', '/api/execution-runs/compare', 500, 750),
  ('execution.report', 'GET', '/api/execution-runs/:id/report', 700, 1000),
  ('admin.execution_runs', 'GET', '/api/admin/execution-runs', 1000, 1500),
  ('admin.observability.slo', 'GET', '/api/admin/observability/slo', 1000, 1500),
  ('admin.retention', 'GET', '/api/admin/retention-policy', 700, 1000),
  ('admin.alerts.scan', 'POST', '/api/admin/alerts/scan', 1000, 1500)
ON CONFLICT (endpoint_key) DO UPDATE SET
  method = EXCLUDED.method,
  path_pattern = EXCLUDED.path_pattern,
  budget_ms = EXCLUDED.budget_ms,
  p95_budget_ms = EXCLUDED.p95_budget_ms,
  updated_at = NOW();

COMMIT;
