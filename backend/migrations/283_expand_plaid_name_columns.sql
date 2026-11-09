-- Plaid investment transaction descriptions and account/security names can
-- exceed 255 characters. Preserve the complete values instead of failing sync
-- or truncating names used for display and transaction classification.
ALTER TABLE plaid_transactions
    ALTER COLUMN merchant_name TYPE TEXT;

ALTER TABLE plaid_accounts
    ALTER COLUMN account_name TYPE TEXT,
    ALTER COLUMN official_name TYPE TEXT;

ALTER TABLE plaid_securities
    ALTER COLUMN name TYPE TEXT;
