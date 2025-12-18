-- Migration: Create broker sync tables for IBKR and Schwab integration
-- This enables automated trade syncing from connected brokerage accounts

-- Table for storing broker connection configurations
CREATE TABLE IF NOT EXISTS broker_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    broker_type VARCHAR(50) NOT NULL CHECK (broker_type IN ('ibkr', 'schwab')),
    connection_status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (connection_status IN ('pending', 'active', 'error', 'revoked', 'expired')),

    -- IBKR Flex Web Service credentials (encrypted)
    ibkr_flex_token TEXT,
    ibkr_flex_query_id VARCHAR(100),

    -- Schwab OAuth credentials (encrypted)
    schwab_access_token TEXT,
    schwab_refresh_token TEXT,
    schwab_token_expires_at TIMESTAMP WITH TIME ZONE,
    schwab_account_id VARCHAR(100),

    -- Sync configuration
    auto_sync_enabled BOOLEAN DEFAULT false,
    sync_frequency VARCHAR(20) DEFAULT 'daily' CHECK (sync_frequency IN ('manual', 'daily')),
    sync_time TIME DEFAULT '06:00:00',

    -- Status tracking
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_sync_status VARCHAR(50),
    last_sync_message TEXT,
    last_sync_trades_imported INTEGER DEFAULT 0,
    last_sync_trades_skipped INTEGER DEFAULT 0,
    next_scheduled_sync TIMESTAMP WITH TIME ZONE,

    -- Error tracking
    consecutive_failures INTEGER DEFAULT 0,
    last_error_at TIMESTAMP WITH TIME ZONE,
    last_error_message TEXT,

    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Each user can only have one connection per broker
    UNIQUE(user_id, broker_type)
);

-- Table for tracking sync history and logs
CREATE TABLE IF NOT EXISTS broker_sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES broker_connections(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    sync_type VARCHAR(20) NOT NULL CHECK (sync_type IN ('manual', 'scheduled', 'retry')),
    status VARCHAR(50) NOT NULL CHECK (status IN ('started', 'fetching', 'parsing', 'importing', 'completed', 'failed')),

    -- Results
    trades_fetched INTEGER DEFAULT 0,
    trades_imported INTEGER DEFAULT 0,
    trades_skipped INTEGER DEFAULT 0,
    trades_failed INTEGER DEFAULT 0,
    duplicates_detected INTEGER DEFAULT 0,

    -- Date range synced
    sync_start_date DATE,
    sync_end_date DATE,

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,

    -- Details
    error_message TEXT,
    error_details JSONB,
    sync_details JSONB,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_broker_connections_user ON broker_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_broker_connections_status ON broker_connections(connection_status);
CREATE INDEX IF NOT EXISTS idx_broker_connections_next_sync ON broker_connections(next_scheduled_sync)
    WHERE auto_sync_enabled = true AND connection_status = 'active';
CREATE INDEX IF NOT EXISTS idx_broker_connections_broker_type ON broker_connections(broker_type);

CREATE INDEX IF NOT EXISTS idx_broker_sync_logs_connection ON broker_sync_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_broker_sync_logs_user ON broker_sync_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_broker_sync_logs_created ON broker_sync_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broker_sync_logs_status ON broker_sync_logs(status);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_broker_connection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS broker_connections_updated_at ON broker_connections;
CREATE TRIGGER broker_connections_updated_at
    BEFORE UPDATE ON broker_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_broker_connection_timestamp();

-- Comments for documentation
COMMENT ON TABLE broker_connections IS 'Stores broker API connection configurations for automated trade syncing';
COMMENT ON TABLE broker_sync_logs IS 'Tracks history of broker sync operations';
COMMENT ON COLUMN broker_connections.ibkr_flex_token IS 'Encrypted IBKR Flex Web Service token';
COMMENT ON COLUMN broker_connections.schwab_access_token IS 'Encrypted Schwab OAuth access token';
