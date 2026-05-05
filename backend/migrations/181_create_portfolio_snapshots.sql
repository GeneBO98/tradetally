CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_identifier VARCHAR(255),
  snapshot_date DATE NOT NULL,
  portfolio_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  cost_basis NUMERIC(15,2) NOT NULL DEFAULT 0,
  position_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_all_unique
ON portfolio_snapshots (user_id, snapshot_date)
WHERE account_identifier IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_account_unique
ON portfolio_snapshots (user_id, account_identifier, snapshot_date)
WHERE account_identifier IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user_date
ON portfolio_snapshots (user_id, snapshot_date DESC);

CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_account_date
ON portfolio_snapshots (user_id, account_identifier, snapshot_date DESC)
WHERE account_identifier IS NOT NULL;
