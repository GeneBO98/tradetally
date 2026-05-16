-- Shared run ledger for live, replay, and backtest execution workflows.
-- This gives each mode the same lifecycle, status, timestamps, metrics, and audit trail.

CREATE TABLE IF NOT EXISTS execution_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('live', 'replay', 'backtest')),
  name VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'running', 'paused', 'completed', 'failed', 'cancelled')),
  source VARCHAR(50),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS execution_run_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_execution_runs_user_mode_created
ON execution_runs(user_id, mode, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_runs_user_status
ON execution_runs(user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_run_events_run_created
ON execution_run_events(run_id, created_at ASC);
