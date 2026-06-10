-- Daily balance history per Plaid account, captured on every sync.
-- One row per account per day; the last sync of the day wins. Powers the
-- account equity curve on the Cashflow view.

CREATE TABLE IF NOT EXISTS plaid_balance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plaid_account_row_id UUID NOT NULL REFERENCES plaid_accounts(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    current_balance DECIMAL(15, 2),
    available_balance DECIMAL(15, 2),
    iso_currency_code VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plaid_account_row_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_plaid_balance_snapshots_user_date
    ON plaid_balance_snapshots(user_id, snapshot_date DESC);

DROP TRIGGER IF EXISTS update_plaid_balance_snapshots_updated_at ON plaid_balance_snapshots;
CREATE TRIGGER update_plaid_balance_snapshots_updated_at
    BEFORE UPDATE ON plaid_balance_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
