-- Add execution-run lineage, reproducibility metadata, report access audit, and retention policy controls.

ALTER TABLE execution_runs
ADD COLUMN IF NOT EXISTS parent_run_id UUID REFERENCES execution_runs(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS lineage_type VARCHAR(30)
  CHECK (lineage_type IS NULL OR lineage_type IN ('replay_of', 'backtest_of', 'rerun_of', 'derived_from')),
ADD COLUMN IF NOT EXISTS market_data_snapshot_id VARCHAR(120),
ADD COLUMN IF NOT EXISTS market_data_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS confidence JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_execution_runs_parent
ON execution_runs(parent_run_id, created_at DESC)
WHERE parent_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_execution_runs_market_snapshot
ON execution_runs(user_id, market_data_snapshot_id)
WHERE market_data_snapshot_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS execution_run_report_accesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
  share_token VARCHAR(64),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  access_type VARCHAR(20) NOT NULL DEFAULT 'owner'
    CHECK (access_type IN ('owner', 'admin', 'shared')),
  format VARCHAR(20) NOT NULL DEFAULT 'json',
  request_id VARCHAR(100),
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_execution_run_report_accesses_run_created
ON execution_run_report_accesses(run_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_run_report_accesses_created
ON execution_run_report_accesses(created_at DESC);

CREATE TABLE IF NOT EXISTS execution_retention_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name VARCHAR(80) NOT NULL UNIQUE,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  event_retention_days INTEGER NOT NULL DEFAULT 365 CHECK (event_retention_days BETWEEN 30 AND 3650),
  telemetry_retention_days INTEGER NOT NULL DEFAULT 90 CHECK (telemetry_retention_days BETWEEN 7 AND 3650),
  report_access_retention_days INTEGER NOT NULL DEFAULT 365 CHECK (report_access_retention_days BETWEEN 30 AND 3650),
  last_run_at TIMESTAMP WITH TIME ZONE,
  last_deleted_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO execution_retention_policies (
  policy_name, is_enabled, event_retention_days, telemetry_retention_days, report_access_retention_days
)
VALUES ('default', TRUE, 365, 90, 365)
ON CONFLICT (policy_name) DO NOTHING;
