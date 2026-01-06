-- Add broker_connection_id to trades to track which trades came from automated broker sync
-- This allows us to distinguish between manually imported trades and broker-synced trades

ALTER TABLE trades
ADD COLUMN IF NOT EXISTS broker_connection_id UUID REFERENCES broker_connections(id) ON DELETE SET NULL;

-- Index for faster lookups when deleting synced trades
CREATE INDEX IF NOT EXISTS idx_trades_broker_connection_id ON trades(broker_connection_id) WHERE broker_connection_id IS NOT NULL;

COMMENT ON COLUMN trades.broker_connection_id IS 'Links to the broker connection that synced this trade. NULL for manually imported trades.';
