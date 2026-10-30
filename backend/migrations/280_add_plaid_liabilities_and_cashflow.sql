-- Migration 280: Plaid liabilities and cash-flow categories for the retirement
-- affordability check.
--
-- plaid_liabilities stores one row per credit card, mortgage or student loan
-- returned by Plaid /liabilities/get so the retirement planner can show debts
-- and monthly minimum payments. plaid_transactions gains a cash-flow category
-- (income, essential, discretionary, debt_payment, savings, transfer, refund,
-- other) that is filled by rules, the configured AI classifier model, or the
-- user. plaid_accounts.include_in_retirement_savings lets a user count a
-- savings account or CD toward "other retirement savings" in the planner.

CREATE TABLE IF NOT EXISTS plaid_liabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES plaid_connections(id) ON DELETE CASCADE,
  plaid_account_row_id UUID NOT NULL REFERENCES plaid_accounts(id) ON DELETE CASCADE,
  liability_type VARCHAR(20) NOT NULL CHECK (liability_type IN ('credit', 'mortgage', 'student')),
  current_balance NUMERIC(18, 2),
  apr_percent NUMERIC(8, 4),
  minimum_payment NUMERIC(18, 2),
  last_payment_amount NUMERIC(18, 2),
  last_payment_date DATE,
  next_payment_due_date DATE,
  origination_date DATE,
  maturity_date DATE,
  is_overdue BOOLEAN NOT NULL DEFAULT false,
  iso_currency_code VARCHAR(10),
  raw_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  synced_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (plaid_account_row_id)
);

CREATE INDEX IF NOT EXISTS idx_plaid_liabilities_user ON plaid_liabilities(user_id);

ALTER TABLE plaid_transactions
  ADD COLUMN IF NOT EXISTS cashflow_category VARCHAR(30),
  ADD COLUMN IF NOT EXISTS cashflow_source VARCHAR(10),
  ADD COLUMN IF NOT EXISTS cashflow_confidence SMALLINT,
  ADD COLUMN IF NOT EXISTS cashflow_classified_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE plaid_transactions DROP CONSTRAINT IF EXISTS plaid_transactions_cashflow_category_check;
ALTER TABLE plaid_transactions ADD CONSTRAINT plaid_transactions_cashflow_category_check
  CHECK (cashflow_category IS NULL OR cashflow_category IN (
    'income', 'essential', 'discretionary', 'debt_payment', 'savings', 'transfer', 'refund', 'other'
  ));

ALTER TABLE plaid_transactions DROP CONSTRAINT IF EXISTS plaid_transactions_cashflow_source_check;
ALTER TABLE plaid_transactions ADD CONSTRAINT plaid_transactions_cashflow_source_check
  CHECK (cashflow_source IS NULL OR cashflow_source IN ('rule', 'ai', 'user'));

CREATE INDEX IF NOT EXISTS idx_plaid_transactions_user_date
  ON plaid_transactions(user_id, transaction_date);

ALTER TABLE plaid_accounts
  ADD COLUMN IF NOT EXISTS include_in_retirement_savings BOOLEAN NOT NULL DEFAULT false;
