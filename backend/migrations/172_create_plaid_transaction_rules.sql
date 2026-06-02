CREATE TABLE IF NOT EXISTS plaid_transaction_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plaid_account_row_id UUID NOT NULL REFERENCES plaid_accounts(id) ON DELETE CASCADE,
    linked_account_id UUID NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    match_description TEXT NOT NULL,
    match_description_normalized TEXT NOT NULL,
    transaction_type VARCHAR(20) NOT NULL
        CHECK (transaction_type IN ('deposit', 'withdrawal')),
    description_override TEXT,
    last_applied_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, plaid_account_row_id, linked_account_id, match_description_normalized)
);

CREATE INDEX IF NOT EXISTS idx_plaid_transaction_rules_lookup
ON plaid_transaction_rules(user_id, plaid_account_row_id, linked_account_id, match_description_normalized);

DROP TRIGGER IF EXISTS update_plaid_transaction_rules_updated_at ON plaid_transaction_rules;
CREATE TRIGGER update_plaid_transaction_rules_updated_at
    BEFORE UPDATE ON plaid_transaction_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE plaid_transaction_rules IS 'Stores persistent Plaid description-based auto-approval rules per linked account';
