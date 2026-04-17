-- Batch 2 achievement rollout focused on planning quality and playbook usage

UPDATE achievements
SET
  name = 'Cooldown Respected',
  description = 'Use a cooling period after at least 80% of losses in a 30 day window',
  points = 90,
  criteria = '{"type": "cooling_period_usage", "percentage": 80}'
WHERE key = 'cool_head';

INSERT INTO achievements (key, name, description, category, difficulty, points, criteria)
VALUES
  (
    'playbook_builder',
    'Playbook Builder',
    'Create 3 active playbooks for your setups',
    'learning',
    'bronze',
    70,
    '{"type": "active_playbooks", "count": 3}'
  ),
  (
    'detailed_planner',
    'Detailed Planner',
    'Complete 15 closed trades with both a stop loss and a take profit defined',
    'behavioral',
    'silver',
    90,
    '{"type": "planned_trades", "count": 15}'
  ),
  (
    'data_hygiene',
    'Data Hygiene',
    'Maintain complete setup, risk, and journal detail on 20 closed trades',
    'learning',
    'silver',
    100,
    '{"type": "trade_data_hygiene", "count": 20, "min_length": 20}'
  ),
  (
    'a_plus_execution',
    'A+ Execution',
    'Log 10 reviewed trades with high adherence and confirmed plan-following',
    'behavioral',
    'gold',
    125,
    '{"type": "high_adherence_reviews", "count": 10, "threshold": 85}'
  )
ON CONFLICT (key) DO NOTHING;
