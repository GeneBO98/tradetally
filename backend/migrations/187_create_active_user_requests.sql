CREATE TABLE IF NOT EXISTS active_user_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  method VARCHAR(10) NOT NULL,
  path TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  status_code INTEGER,
  process_id INTEGER,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_active_user_requests_open
ON active_user_requests(user_id, started_at DESC)
WHERE completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_active_user_requests_started
ON active_user_requests(started_at DESC);
