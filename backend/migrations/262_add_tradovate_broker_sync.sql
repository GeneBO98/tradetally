-- Add Tradovate partner-OAuth broker sync support.
-- OAuth tokens reuse the generic oauth_* columns from migration 177. One
-- Tradovate login (external_user_id) can hold several trading accounts, and
-- prop-firm traders often have one login per firm, so connections are unique
-- per Tradovate user rather than per TradeTally user.

ALTER TABLE broker_connections
DROP CONSTRAINT IF EXISTS broker_connections_broker_type_check;

ALTER TABLE broker_connections
ADD CONSTRAINT broker_connections_broker_type_check
CHECK (broker_type IN ('ibkr', 'schwab', 'tradestation', 'alpaca', 'trading212', 'tradovate'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_broker_connections_user_tradovate_login
    ON broker_connections (user_id, COALESCE(external_user_id, ''))
    WHERE broker_type = 'tradovate';

-- The IBKR scheduler records transient timeout retries as 'ibkr_timeout_retry',
-- which the original CHECK rejected, so those retries never got a sync log.
ALTER TABLE broker_sync_logs
DROP CONSTRAINT IF EXISTS broker_sync_logs_sync_type_check;

ALTER TABLE broker_sync_logs
ADD CONSTRAINT broker_sync_logs_sync_type_check
CHECK (sync_type IN ('manual', 'scheduled', 'retry', 'ibkr_timeout_retry'));
