ALTER TABLE broker_connections DROP CONSTRAINT IF EXISTS broker_connections_broker_type_check;
ALTER TABLE broker_connections ADD CONSTRAINT broker_connections_broker_type_check
  CHECK (broker_type IN ('ibkr', 'schwab', 'tradestation', 'alpaca', 'trading212', 'tradovate', 'webull', 'oanda'));
ALTER TABLE broker_connections ADD COLUMN IF NOT EXISTS oanda_api_token TEXT;
COMMENT ON COLUMN broker_connections.oanda_api_token IS 'Encrypted OANDA v20 personal access token';
CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_connections_oanda_account
  ON broker_connections (user_id, broker_environment, external_account_id) WHERE broker_type = 'oanda';

ALTER TABLE trades ADD COLUMN IF NOT EXISTS broker_trade_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_trades_oanda_identity
  ON trades (user_id, account_identifier, broker_trade_id)
  WHERE broker = 'oanda' AND broker_trade_id IS NOT NULL;

ALTER TABLE trades DROP CONSTRAINT IF EXISTS trades_instrument_type_check;
ALTER TABLE trades ADD CONSTRAINT trades_instrument_type_check
  CHECK (instrument_type IN ('stock', 'option', 'future', 'crypto', 'forex', 'cfd'));
