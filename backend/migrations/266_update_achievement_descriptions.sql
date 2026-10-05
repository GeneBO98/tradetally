-- Copy updates to match corrected achievement criteria (achievementService):
-- R-multiple instead of percent moves, trade fields instead of note text,
-- and day-level P&L instead of "portfolio balance".
UPDATE achievements SET description = 'Close a trade for 3R or more', updated_at = CURRENT_TIMESTAMP
WHERE key = 'risk_taker';

UPDATE achievements SET description = 'Close 20 trades for 2R or more', updated_at = CURRENT_TIMESTAMP
WHERE key = 'risk_reward_master';

UPDATE achievements SET description = 'Finish a trading day with positive net P&L', updated_at = CURRENT_TIMESTAMP
WHERE key = 'green_day';

UPDATE achievements SET description = 'Set a stop loss on a trade - great risk management!', updated_at = CURRENT_TIMESTAMP
WHERE key = 'risk_conscious';

UPDATE achievements SET description = 'Set a take profit on a trade - planning for success!', updated_at = CURRENT_TIMESTAMP
WHERE key = 'profit_taker';

UPDATE achievements SET description = 'Place a trade within the first 10 minutes after the 9:30 ET open', updated_at = CURRENT_TIMESTAMP
WHERE key = 'early_bird_market_open';
