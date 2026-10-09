-- Redefined criteria (achievementService):
-- * Discipline Master / Risk Manager now measure trading within plan: a stop
--   loss set and no loss beyond 1R, instead of a share of 1.5% winners and a
--   flat $1,000 P&L cap.
-- * Portfolio Booster uses real account balances from Account & Cashflow
--   instead of an assumed $10,000 account.
-- * Pattern Spotter counted detected revenge-trading patterns (rewarding the
--   behavior it should discourage) and needed 10 pattern types when only 3
--   exist. Retired; nobody had earned it.
UPDATE achievements
SET description = 'Keep 90% of your closed trades within plan (stop loss set, loss no more than 1R) across 30 days with at least 20 trades',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'discipline_master';

UPDATE achievements
SET description = 'Close 100 trades in a row with a stop loss set and no loss beyond 1R',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'risk_manager';

UPDATE achievements
SET description = 'Grow an account 5% in a single week (uses the starting balance on Account & Cashflow)',
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'portfolio_booster';

UPDATE achievements
SET is_active = false,
    updated_at = CURRENT_TIMESTAMP
WHERE key = 'pattern_spotter';
