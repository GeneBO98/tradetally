-- Migration: Allow multiple IBKR connections per user
-- Previously limited to one connection per broker type per user.
-- This enables users to connect multiple IBKR accounts (e.g., main + paper trading).

-- Add account_label column for users to name their connections
ALTER TABLE broker_connections ADD COLUMN IF NOT EXISTS account_label VARCHAR(100);

-- Drop the old unique constraint that limited one connection per broker type
ALTER TABLE broker_connections DROP CONSTRAINT IF EXISTS broker_connections_user_id_broker_type_key;

-- Add new unique constraint: prevent duplicate IBKR connections with the same query ID
-- This allows multiple IBKR connections (different query IDs) but prevents accidentally
-- adding the same Flex Query twice
CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_connections_user_ibkr_query
    ON broker_connections (user_id, ibkr_flex_query_id)
    WHERE broker_type = 'ibkr' AND ibkr_flex_query_id IS NOT NULL;

-- Keep Schwab limited to one connection per user (Schwab handles multi-account internally)
CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_connections_user_schwab
    ON broker_connections (user_id)
    WHERE broker_type = 'schwab';

COMMENT ON COLUMN broker_connections.account_label IS 'User-defined label for the connection (e.g., Main Account, Paper Trading)';
