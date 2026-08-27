-- Durable diagnostics for periodic background schedulers. This is deliberately
-- generic so operators can inspect last success/failure across restarts without
-- adding one status table per scheduler.
CREATE TABLE IF NOT EXISTS scheduler_status (
  scheduler_name VARCHAR(100) PRIMARY KEY,
  last_started_at TIMESTAMP WITH TIME ZONE,
  last_success_at TIMESTAMP WITH TIME ZONE,
  last_failure_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  last_summary JSONB,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_status_updated_at
  ON scheduler_status(updated_at DESC);
