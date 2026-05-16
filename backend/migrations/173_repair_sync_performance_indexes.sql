-- Repair indexes that may have been skipped by the old permissive migration runner.
-- Avoid references to the removed/nonexistent trades.status column.

CREATE INDEX IF NOT EXISTS idx_trades_user_closed_date_pnl
ON trades(user_id, trade_date DESC, pnl)
WHERE exit_price IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_trades_user_open_symbol_entry
ON trades(user_id, symbol, entry_time)
WHERE exit_price IS NULL AND exit_time IS NULL;

CREATE INDEX IF NOT EXISTS idx_trades_user_account_date_not_empty
ON trades(user_id, account_identifier, trade_date DESC)
WHERE account_identifier IS NOT NULL AND account_identifier <> '';

CREATE INDEX IF NOT EXISTS idx_broker_sync_logs_user_created_at
ON broker_sync_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_broker_connections_due_claim
ON broker_connections(next_scheduled_sync, id)
WHERE auto_sync_enabled = true
  AND connection_status = 'active'
  AND consecutive_failures < 3;

COMMENT ON INDEX idx_trades_user_closed_date_pnl IS 'Dashboard and filtered trade list index for closed trades';
COMMENT ON INDEX idx_trades_user_open_symbol_entry IS 'Broker sync and open-position lookup index';
COMMENT ON INDEX idx_trades_user_account_date_not_empty IS 'Global account filter index excluding unsorted/null accounts';
COMMENT ON INDEX idx_broker_sync_logs_user_created_at IS 'User sync-log timeline index';
COMMENT ON INDEX idx_broker_connections_due_claim IS 'Scheduled broker sync due-connection claim index';
