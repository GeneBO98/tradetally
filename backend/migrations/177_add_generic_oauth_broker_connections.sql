-- Add generic OAuth fields for direct broker integrations beyond Schwab.

ALTER TABLE broker_connections
DROP CONSTRAINT IF EXISTS broker_connections_broker_type_check;

ALTER TABLE broker_connections
ADD CONSTRAINT broker_connections_broker_type_check
CHECK (broker_type IN ('ibkr', 'schwab', 'tradestation', 'alpaca'));

ALTER TABLE broker_connections
ADD COLUMN IF NOT EXISTS oauth_access_token TEXT,
ADD COLUMN IF NOT EXISTS oauth_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS oauth_token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS oauth_refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS oauth_scopes TEXT[],
ADD COLUMN IF NOT EXISTS external_account_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS external_user_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS broker_environment VARCHAR(50),
ADD COLUMN IF NOT EXISTS broker_metadata JSONB DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_connections_user_tradestation
    ON broker_connections (user_id)
    WHERE broker_type = 'tradestation';

CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_connections_user_alpaca_environment
    ON broker_connections (user_id, COALESCE(broker_environment, 'live'))
    WHERE broker_type = 'alpaca';

COMMENT ON COLUMN broker_connections.oauth_access_token IS 'Encrypted generic broker OAuth access token';
COMMENT ON COLUMN broker_connections.oauth_refresh_token IS 'Encrypted generic broker OAuth refresh token';
COMMENT ON COLUMN broker_connections.broker_environment IS 'Broker environment for OAuth integrations, such as live or paper';

ALTER TABLE oauth_pending_states
ADD COLUMN IF NOT EXISTS context JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN oauth_pending_states.context IS 'Non-sensitive OAuth flow context, such as requested broker environment';
