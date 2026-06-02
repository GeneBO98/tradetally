-- Portfolio rebalancing targets, keyed by (user_id, symbol) rather than by a
-- holding row. This lets a user set a target allocation on ANY position shown in
-- the Allocation & Rebalancing table -- including positions derived purely from
-- open trades, which have no investment_holdings row to store a target on.

CREATE TABLE IF NOT EXISTS portfolio_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(30) NOT NULL,
  target_allocation_percent DECIMAL(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_targets_user ON portfolio_targets(user_id);

-- Preserve targets previously stored on investment_holdings so existing users
-- don't lose them when the source of truth moves to this table.
INSERT INTO portfolio_targets (user_id, symbol, target_allocation_percent)
SELECT user_id, symbol, target_allocation_percent
FROM investment_holdings
WHERE target_allocation_percent IS NOT NULL
ON CONFLICT (user_id, symbol) DO NOTHING;
