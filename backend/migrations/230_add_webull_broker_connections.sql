-- Allow Webull as a broker connection type (OAuth via Webull Connect API).

ALTER TABLE broker_connections
DROP CONSTRAINT IF EXISTS broker_connections_broker_type_check;

ALTER TABLE broker_connections
ADD CONSTRAINT broker_connections_broker_type_check
CHECK (broker_type IN ('ibkr', 'schwab', 'tradestation', 'alpaca', 'webull'));

-- One Webull connection per user (upsert target for BrokerConnection.create).
CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_connections_user_webull
    ON broker_connections (user_id)
    WHERE broker_type = 'webull';
