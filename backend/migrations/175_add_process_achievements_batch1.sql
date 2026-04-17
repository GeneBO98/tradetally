-- Batch 1 achievement rollout focused on process quality and discipline

-- Align existing achievement copy with the new batch language without changing
-- points or criteria for already-awarded records.
UPDATE achievements
SET
  name = 'No Revenge',
  description = 'Go 7 days without any revenge trading incidents'
WHERE key = 'revenge_free_week';

UPDATE achievements
SET
  name = 'Green Week',
  description = 'Finish the week net positive with at least 5 closed trades'
WHERE key = 'profitable_week';

INSERT INTO achievements (key, name, description, category, difficulty, points, criteria)
VALUES
  (
    'risk_defined',
    'Risk Defined',
    'Complete 15 closed trades with a defined stop loss',
    'behavioral',
    'bronze',
    75,
    '{"type": "closed_trades_with_stop_loss", "count": 15}'
  ),
  (
    'journaled',
    'Journaled',
    'Add meaningful trade notes or review notes on 20 closed trades',
    'learning',
    'bronze',
    60,
    '{"type": "journaled_trades", "count": 20, "min_length": 20}'
  ),
  (
    'review_habit',
    'Review Habit',
    'Complete 8 trade reviews within a 14 day window',
    'learning',
    'silver',
    100,
    '{"type": "review_habit", "count": 8, "days": 14}'
  ),
  (
    'rule_follower',
    'Rule Follower',
    'Log 12 reviewed trades where you followed the plan',
    'behavioral',
    'silver',
    100,
    '{"type": "followed_plan_count", "count": 12}'
  )
ON CONFLICT (key) DO NOTHING;
