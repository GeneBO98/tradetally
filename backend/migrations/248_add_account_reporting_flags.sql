-- Add lifecycle and reporting controls to managed trading accounts.
-- Archived accounts keep their trades and cashflow history, but are hidden
-- from active account selectors. Reporting remains an explicit per-account
-- choice so historical/demo accounts can be retained without distorting the
-- user's current metrics.

ALTER TABLE user_accounts
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS include_in_reports BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_user_accounts_active
  ON user_accounts(user_id, is_archived, account_name);

CREATE INDEX IF NOT EXISTS idx_user_accounts_reporting_identifier
  ON user_accounts(user_id, account_identifier)
  WHERE include_in_reports = FALSE;

COMMENT ON COLUMN user_accounts.is_archived IS
  'Whether this account is hidden from active account selectors while retaining its history';
COMMENT ON COLUMN user_accounts.include_in_reports IS
  'Whether trades assigned to this account contribute to aggregate reports and charts';
