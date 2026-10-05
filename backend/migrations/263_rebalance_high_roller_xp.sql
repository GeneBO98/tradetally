-- Rebalance High Roller XP so position size is no longer worth more than
-- discipline achievements, and add a fourth tier.
--
-- Grandfathering: XP is added to user_gamification_stats at award time, so
-- lowering achievements.points does not change anyone's total. To keep that
-- true for code that rebuilds totals from earned achievements (syncUserStats),
-- record the points each user actually received on their award row first.

ALTER TABLE user_achievements ADD COLUMN IF NOT EXISTS points_awarded INTEGER;

UPDATE user_achievements ua
SET points_awarded = a.points
FROM achievements a
WHERE a.id = ua.achievement_id
  AND ua.points_awarded IS NULL;

UPDATE achievements SET points = 50,  updated_at = CURRENT_TIMESTAMP WHERE key = 'high_roller_i';
UPDATE achievements SET points = 75,  updated_at = CURRENT_TIMESTAMP WHERE key = 'high_roller_ii';
UPDATE achievements SET points = 100, updated_at = CURRENT_TIMESTAMP WHERE key = 'high_roller_iii';

INSERT INTO achievements (key, name, description, category, difficulty, points, criteria)
VALUES (
  'high_roller_iv',
  'High Roller IV',
  'Execute a trade with a position size of $100,000 or more',
  'milestone',
  'platinum',
  125,
  '{"type": "position_size", "min_size": 100000}'
)
ON CONFLICT (key) DO NOTHING;
