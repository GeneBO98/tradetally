-- Migration: Add Plaid-powered funding sync for Accounts & Cashflow

ALTER TABLE account_transactions
ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'plaid'));

ALTER TABLE account_transactions
ADD COLUMN IF NOT EXISTS source_reference_id VARCHAR(255);

ALTER TABLE account_transactions
ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_account_transactions_source_reference
ON account_transactions (source_type, source_reference_id)
WHERE source_reference_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS plaid_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item_id VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    institution_id VARCHAR(255),
    institution_name VARCHAR(255),
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('bank', 'investment')),
    connection_status VARCHAR(50) NOT NULL DEFAULT 'active'
        CHECK (connection_status IN ('active', 'error', 'revoked')),
    auto_sync_enabled BOOLEAN NOT NULL DEFAULT false,
    sync_frequency VARCHAR(20) NOT NULL DEFAULT 'daily'
        CHECK (sync_frequency IN ('manual', 'daily')),
    sync_time TIME NOT NULL DEFAULT '06:00:00',
    next_scheduled_sync TIMESTAMP WITH TIME ZONE,
    last_sync_cursor TEXT,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_sync_status VARCHAR(50),
    last_sync_message TEXT,
    last_error_at TIMESTAMP WITH TIME ZONE,
    last_error_message TEXT,
    consecutive_failures INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, item_id)
);

CREATE TABLE IF NOT EXISTS plaid_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES plaid_connections(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plaid_account_id VARCHAR(255) NOT NULL,
    account_name VARCHAR(255) NOT NULL,
    official_name VARCHAR(255),
    mask VARCHAR(20),
    account_type VARCHAR(50),
    account_subtype VARCHAR(50),
    tracking_mode VARCHAR(20) NOT NULL DEFAULT 'tracked_account'
        CHECK (tracking_mode IN ('tracked_account', 'funding_source')),
    linked_account_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
    current_balance DECIMAL(15, 2),
    available_balance DECIMAL(15, 2),
    iso_currency_code VARCHAR(10),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(plaid_account_id)
);

CREATE TABLE IF NOT EXISTS plaid_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    connection_id UUID NOT NULL REFERENCES plaid_connections(id) ON DELETE CASCADE,
    plaid_account_row_id UUID NOT NULL REFERENCES plaid_accounts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    external_transaction_id VARCHAR(255) NOT NULL,
    pending_transaction_id VARCHAR(255),
    transaction_source VARCHAR(20) NOT NULL CHECK (transaction_source IN ('bank', 'investment')),
    amount DECIMAL(15, 2) NOT NULL,
    iso_currency_code VARCHAR(10),
    transaction_date DATE NOT NULL,
    authorized_date DATE,
    description TEXT NOT NULL,
    merchant_name VARCHAR(255),
    pending BOOLEAN NOT NULL DEFAULT false,
    is_removed BOOLEAN NOT NULL DEFAULT false,
    review_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending', 'approved', 'rejected')),
    review_reason VARCHAR(50),
    direction_guess VARCHAR(20) NOT NULL DEFAULT 'ambiguous'
        CHECK (direction_guess IN ('deposit', 'withdrawal', 'ambiguous')),
    confidence INTEGER NOT NULL DEFAULT 0,
    account_transaction_id UUID REFERENCES account_transactions(id) ON DELETE SET NULL,
    metadata JSONB,
    raw_payload JSONB,
    last_synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(external_transaction_id)
);

CREATE INDEX IF NOT EXISTS idx_plaid_connections_user_id ON plaid_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_connections_due_sync ON plaid_connections(next_scheduled_sync)
WHERE auto_sync_enabled = true AND connection_status = 'active';

CREATE INDEX IF NOT EXISTS idx_plaid_accounts_user_id ON plaid_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_linked_account_id ON plaid_accounts(linked_account_id);
CREATE INDEX IF NOT EXISTS idx_plaid_accounts_connection_id ON plaid_accounts(connection_id);

CREATE INDEX IF NOT EXISTS idx_plaid_transactions_user_id ON plaid_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_account_row_id ON plaid_transactions(plaid_account_row_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_review_queue
ON plaid_transactions(user_id, review_status, transaction_date DESC)
WHERE review_status = 'pending' AND is_removed = false;

DROP TRIGGER IF EXISTS update_plaid_connections_updated_at ON plaid_connections;
CREATE TRIGGER update_plaid_connections_updated_at
    BEFORE UPDATE ON plaid_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_plaid_accounts_updated_at ON plaid_accounts;
CREATE TRIGGER update_plaid_accounts_updated_at
    BEFORE UPDATE ON plaid_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_plaid_transactions_updated_at ON plaid_transactions;
CREATE TRIGGER update_plaid_transactions_updated_at
    BEFORE UPDATE ON plaid_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE plaid_connections IS 'Stores encrypted Plaid Items and sync configuration for funding sync';
COMMENT ON TABLE plaid_accounts IS 'Stores Plaid accounts discovered under a connected Item and their mapping to TradeTally accounts';
COMMENT ON TABLE plaid_transactions IS 'Stores synced Plaid candidate funding transactions and their review/import state';
