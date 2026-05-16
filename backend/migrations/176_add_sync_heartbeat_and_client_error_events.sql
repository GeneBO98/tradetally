-- Add broker sync heartbeat visibility and persisted frontend error telemetry.

ALTER TABLE broker_connections
ADD COLUMN IF NOT EXISTS sync_heartbeat_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_broker_connections_sync_heartbeat
ON broker_connections(sync_heartbeat_at)
WHERE sync_claimed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS client_error_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  context VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  route TEXT,
  component VARCHAR(150),
  status_code INTEGER,
  request_id VARCHAR(100),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_client_error_events_user_created
ON client_error_events(user_id, created_at DESC)
WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_client_error_events_context_created
ON client_error_events(context, created_at DESC);
