-- Allow users to bound broker syncs to a starting trade date so they don't
-- pull in older history they don't care about.
ALTER TABLE broker_connections
    ADD COLUMN IF NOT EXISTS sync_start_date DATE NULL;

COMMENT ON COLUMN broker_connections.sync_start_date IS
    'Earliest trade date to include in syncs. NULL = no lower bound (broker default lookback).';
