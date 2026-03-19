-- Add Bitunix broker sync support

ALTER TABLE broker_connections
DROP CONSTRAINT IF EXISTS broker_connections_broker_type_check;

ALTER TABLE broker_connections
ADD CONSTRAINT broker_connections_broker_type_check
CHECK (broker_type IN ('ibkr', 'schwab', 'bitunix'));

ALTER TABLE broker_connections
ADD COLUMN IF NOT EXISTS bitunix_api_key TEXT,
ADD COLUMN IF NOT EXISTS bitunix_api_secret TEXT,
ADD COLUMN IF NOT EXISTS bitunix_margin_coin VARCHAR(20) DEFAULT 'USDT';

COMMENT ON COLUMN broker_connections.bitunix_api_key IS 'Encrypted Bitunix API key';
COMMENT ON COLUMN broker_connections.bitunix_api_secret IS 'Encrypted Bitunix API secret';
COMMENT ON COLUMN broker_connections.bitunix_margin_coin IS 'Bitunix futures margin coin to sync, defaults to USDT';
