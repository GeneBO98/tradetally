-- Add a database-level claim/lease for broker sync workers.
-- This prevents multiple app instances or scheduler ticks from importing the same connection concurrently.

ALTER TABLE broker_connections
ADD COLUMN IF NOT EXISTS sync_claimed_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS sync_claimed_by VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_broker_connections_sync_claim
ON broker_connections(auto_sync_enabled, connection_status, next_scheduled_sync, sync_claimed_at)
WHERE auto_sync_enabled = true;
