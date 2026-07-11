-- Add Trading 212 API-key broker sync support.

ALTER TABLE broker_connections
DROP CONSTRAINT IF EXISTS broker_connections_broker_type_check;

ALTER TABLE broker_connections
ADD CONSTRAINT broker_connections_broker_type_check
CHECK (broker_type IN ('ibkr', 'schwab', 'tradestation', 'alpaca', 'trading212'));

ALTER TABLE broker_connections
ADD COLUMN IF NOT EXISTS trading212_api_key TEXT,
ADD COLUMN IF NOT EXISTS trading212_api_secret TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_connections_user_trading212_environment
    ON broker_connections (user_id, COALESCE(broker_environment, 'live'))
    WHERE broker_type = 'trading212';

COMMENT ON COLUMN broker_connections.trading212_api_key IS 'Encrypted Trading 212 API key';
COMMENT ON COLUMN broker_connections.trading212_api_secret IS 'Encrypted Trading 212 API secret';
