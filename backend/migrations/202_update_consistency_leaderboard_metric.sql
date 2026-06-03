-- Clarify the consistency leaderboard after replacing the old volume-weighted
-- average P&L score with a bounded repeatability score.
UPDATE leaderboards
SET
  name = 'Most Consistent Trader',
  description = 'Based on positive expectancy, win rate, P&L stability, and trade count',
  metric_key = 'consistency_score',
  period_type = 'all_time',
  is_active = true
WHERE key = 'consistency_score';
