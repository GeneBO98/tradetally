-- Insert default challenges for users to participate in

-- Weekly challenges
INSERT INTO challenges (key, name, description, category, start_date, end_date, criteria, reward_points, is_community, target_value) VALUES
(
  'revenge_free_week', 
  'Revenge Trading Free Week', 
  'Go an entire week without any revenge trading incidents. Stay disciplined and break the cycle of emotional trading!',
  'behavioral',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '7 days',
  '{"type": "trades_without_revenge", "start_date": "CURRENT_DATE", "target_trades": 5}',
  100,
  false,
  7
),
(
  'risk_management_week',
  'Risk Management Master',
  'Keep all your trades within 2% risk for a full week. Show that you can stick to your risk management rules!',
  'behavioral',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '7 days',
  '{"type": "risk_management", "risk_threshold": 2, "min_trades": 10}',
  75,
  false,
  10
),
(
  'consistency_challenge',
  'Consistency Champion',
  'Maintain a positive discipline score above 80% for 5 consecutive trading days.',
  'behavioral',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '10 days',
  '{"type": "maintain_discipline", "threshold": 80, "consecutive_days": 5}',
  150,
  false,
  5
);

-- Monthly challenges
INSERT INTO challenges (key, name, description, category, start_date, end_date, criteria, reward_points, is_community, target_value) VALUES
(
  'profitable_month',
  'Profitable Month Challenge',
  'End the month with positive P&L while maintaining good risk management practices.',
  'performance',
  date_trunc('month', CURRENT_DATE),
  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day',
  '{"type": "monthly_profit", "min_trades": 20, "risk_compliance": 80}',
  300,
  false,
  1
),
(
  'discipline_master_month',
  'Discipline Master Monthly',
  'Achieve and maintain a discipline score above 85% for an entire month.',
  'behavioral',
  date_trunc('month', CURRENT_DATE),
  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day',
  '{"type": "maintain_discipline", "threshold": 85, "days": 30}',
  250,
  false,
  30
),
(
  'learning_month',
  'Learning & Growth Month',
  'Identify and acknowledge 5 different behavioral patterns in your trading.',
  'learning',
  date_trunc('month', CURRENT_DATE),
  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day',
  '{"type": "patterns_identified", "count": 5, "acknowledge": true}',
  200,
  false,
  5
);

-- Community challenges
INSERT INTO challenges (key, name, description, category, start_date, end_date, criteria, reward_points, is_community, target_value) VALUES
(
  'community_discipline_q1',
  'Community Discipline Drive Q1',
  'Help the TradeTally community improve overall discipline by 15% this quarter. Every trader''s improvement counts!',
  'behavioral',
  date_trunc('quarter', CURRENT_DATE),
  date_trunc('quarter', CURRENT_DATE) + INTERVAL '3 months' - INTERVAL '1 day',
  '{"type": "community_improvement", "metric": "discipline_score", "target_improvement": 15, "baseline_date": "CURRENT_DATE"}',
  500,
  true,
  15
),
(
  'revenge_trading_reduction',
  'Community Revenge Trading Reduction',
  'Let''s work together to reduce revenge trading incidents across the platform by 25% this month.',
  'behavioral',
  date_trunc('month', CURRENT_DATE),
  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day',
  '{"type": "community_improvement", "metric": "revenge_trading_rate", "target_improvement": -25}',
  400,
  true,
  25
);

-- Seasonal/Special challenges
INSERT INTO challenges (key, name, description, category, start_date, end_date, criteria, reward_points, is_community, target_value) VALUES
(
  'new_year_fresh_start',
  'New Year, New Trading Habits',
  'Start the year strong by maintaining perfect risk management for your first 25 trades.',
  'behavioral',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '30 days',
  '{"type": "risk_management", "trades": 25, "perfect_compliance": true}',
  300,
  false,
  25
),
(
  'milestone_hunter',
  'Achievement Milestone Hunter',
  'Earn 3 different achievements in a single month to show your commitment to improvement.',
  'milestone',
  date_trunc('month', CURRENT_DATE),
  date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day',
  '{"type": "achievements_earned", "count": 3, "timeframe": "month"}',
  350,
  false,
  3
);

-- Beginner-friendly challenges
INSERT INTO challenges (key, name, description, category, start_date, end_date, criteria, reward_points, is_community, target_value) VALUES
(
  'first_week_discipline',
  'First Week Discipline',
  'New to TradeTally? Start building good habits by completing 5 trades with proper risk management.',
  'learning',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '14 days',
  '{"type": "beginner_discipline", "trades": 5, "risk_compliance": 100}',
  50,
  false,
  5
),
(
  'pattern_awareness',
  'Pattern Awareness Challenge',
  'Learn to identify your trading patterns by acknowledging your first behavioral analysis.',
  'learning',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '21 days',
  '{"type": "first_pattern_acknowledgment", "any_pattern": true}',
  75,
  false,
  1
);

-- Advanced challenges
INSERT INTO challenges (key, name, description, category, start_date, end_date, criteria, reward_points, is_community, target_value) VALUES
(
  'elite_consistency',
  'Elite Trader Consistency',
  'Achieve 90%+ discipline score for 30 consecutive trading days. Only for the most dedicated traders!',
  'behavioral',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '45 days',
  '{"type": "maintain_discipline", "threshold": 90, "consecutive_days": 30}',
  1000,
  false,
  30
),
(
  'peer_mentor',
  'Peer Group Mentor',
  'Reach the top 10% of your peer group in discipline and maintain it for 2 weeks.',
  'social',
  CURRENT_DATE,
  CURRENT_DATE + INTERVAL '21 days',
  '{"type": "peer_rank", "percentile": 90, "maintain_days": 14}',
  500,
  false,
  14
);

-- Create some recurring weekly challenges that auto-regenerate
-- These would be managed by a cron job or scheduled task

-- Update achievements to link with some challenges
UPDATE achievements 
SET criteria = jsonb_set(criteria, '{linked_challenge}', '"revenge_free_week"')
WHERE key = 'revenge_free_week';

UPDATE achievements 
SET criteria = jsonb_set(criteria, '{linked_challenge}', '"risk_management_week"')
WHERE key = 'risk_manager';

UPDATE achievements 
SET criteria = jsonb_set(criteria, '{linked_challenge}', '"consistency_challenge"')
WHERE key = 'discipline_master';

-- Link some challenges to achievements as rewards
UPDATE challenges 
SET reward_achievement_id = (SELECT id FROM achievements WHERE key = 'revenge_free_week')
WHERE key = 'revenge_free_week';

UPDATE challenges 
SET reward_achievement_id = (SELECT id FROM achievements WHERE key = 'risk_manager')
WHERE key = 'risk_management_week';

UPDATE challenges 
SET reward_achievement_id = (SELECT id FROM achievements WHERE key = 'discipline_master')
WHERE key = 'elite_consistency';