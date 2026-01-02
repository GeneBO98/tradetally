-- Migration: Create tables for Account & Cashflow tracking
-- GitHub Issue: #135

-- user_accounts: Track brokerage accounts with initial balance and primary account designation
CREATE TABLE IF NOT EXISTS user_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_name VARCHAR(100) NOT NULL,
    account_identifier VARCHAR(255),  -- Links to trades.account_identifier
    broker VARCHAR(50),
    initial_balance DECIMAL(15,2) NOT NULL DEFAULT 0.00,
    initial_balance_date DATE NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- account_transactions: Records deposits and withdrawals for cashflow tracking
CREATE TABLE IF NOT EXISTS account_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal')),
    amount DECIMAL(15,2) NOT NULL,
    transaction_date DATE NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_accounts_user_id ON user_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_identifier ON user_accounts(account_identifier);

CREATE INDEX IF NOT EXISTS idx_account_transactions_account_id ON account_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_account_transactions_user_id ON account_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_account_transactions_date ON account_transactions(transaction_date);

-- Ensure only one primary account per user (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_accounts_primary_unique
ON user_accounts(user_id) WHERE is_primary = true;

-- Triggers for updated_at timestamps
DROP TRIGGER IF EXISTS update_user_accounts_updated_at ON user_accounts;
CREATE TRIGGER update_user_accounts_updated_at
    BEFORE UPDATE ON user_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_account_transactions_updated_at ON account_transactions;
CREATE TRIGGER update_account_transactions_updated_at
    BEFORE UPDATE ON account_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE user_accounts IS 'Tracks user brokerage accounts with initial balance and primary account designation';
COMMENT ON TABLE account_transactions IS 'Records deposits and withdrawals for cashflow tracking';
COMMENT ON COLUMN user_accounts.account_identifier IS 'Links to trades.account_identifier for associating trades with this account';
COMMENT ON COLUMN user_accounts.is_primary IS 'Primary account is used as default for imports and displayed first';
COMMENT ON COLUMN user_accounts.initial_balance IS 'Starting cash balance for cashflow calculations';
COMMENT ON COLUMN user_accounts.initial_balance_date IS 'Date from which cashflow calculations begin';
