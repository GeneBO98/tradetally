-- Batch 3 achievement rollout focused on proven edge and setup quality

INSERT INTO achievements (key, name, description, category, difficulty, points, criteria)
VALUES
  (
    'let_winners_work',
    'Let Winners Work',
    'Close 10 trades with at least +2R',
    'performance',
    'silver',
    100,
    '{"type": "r_multiple_winners", "count": 10, "min_r": 2.0}'
  ),
  (
    'setup_specialist',
    'Setup Specialist',
    'On one playbook, log 12 reviewed trades with at least 85 average adherence and 10 plan-following reviews',
    'learning',
    'silver',
    110,
    '{"type": "disciplined_playbook", "count": 12, "min_followed_count": 10, "min_adherence": 85}'
  ),
  (
    'plan_has_edge',
    'Plan Has Edge',
    'Show that your followed trades outperform your broken-plan trades on one reviewed playbook',
    'behavioral',
    'gold',
    130,
    '{"type": "followed_beats_broken", "min_followed_count": 8, "min_broken_count": 5}'
  ),
  (
    'proven_setup',
    'Proven Setup',
    'On one playbook, record 20 reviewed trades with at least +1.0 average R and 1.5 profit factor',
    'performance',
    'gold',
    150,
    '{"type": "profitable_playbook", "count": 20, "min_avg_r": 1.0, "min_profit_factor": 1.5}'
  ),
  (
    'edge_keeper',
    'Edge Keeper',
    'Sustain one playbook across 30 reviewed trades with at least 55% win rate and +1.0 average R',
    'performance',
    'gold',
    175,
    '{"type": "sustained_profitable_playbook", "count": 30, "min_win_rate": 55, "min_avg_r": 1.0}'
  )
ON CONFLICT (key) DO NOTHING;
