-- Add account_identifier to trades to track which broker account trades came from
-- The identifier is privacy-redacted (e.g., "****1234" showing only last 4 characters)

ALTER TABLE trades
ADD COLUMN IF NOT EXISTS account_identifier VARCHAR(20);

-- Index for filtering trades by account
CREATE INDEX IF NOT EXISTS idx_trades_account_identifier ON trades(account_identifier) WHERE account_identifier IS NOT NULL;

COMMENT ON COLUMN trades.account_identifier IS 'Privacy-redacted broker account identifier (last 4 chars only, e.g., ****1234)';
