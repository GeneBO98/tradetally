-- Migration: Add more sync frequency options for near real-time broker syncing
-- This allows users to sync more frequently than once per day

-- Drop the existing constraint and add a new one with more frequency options
ALTER TABLE broker_connections
DROP CONSTRAINT IF EXISTS broker_connections_sync_frequency_check;

ALTER TABLE broker_connections
ADD CONSTRAINT broker_connections_sync_frequency_check
CHECK (sync_frequency IN ('manual', 'hourly', 'every_4_hours', 'every_6_hours', 'every_12_hours', 'daily'));

-- Add a comment documenting the frequency options
COMMENT ON COLUMN broker_connections.sync_frequency IS 'Sync frequency: manual, hourly, every_4_hours, every_6_hours, every_12_hours, or daily';
