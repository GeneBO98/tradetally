-- Add some easy/immediate achievements for testing and user engagement

INSERT INTO achievements (key, name, description, category, difficulty, points, criteria) VALUES

-- Immediate achievements
('welcome_aboard', 'Welcome Aboard!', 'Welcome to TradeTally! Your journey to better trading starts now.', 'milestone', 'bronze', 25, '{"type": "registration", "immediate": true}'),
('dashboard_explorer', 'Dashboard Explorer', 'Visit the gamification dashboard for the first time.', 'learning', 'bronze', 15, '{"type": "dashboard_visit", "immediate": true}'),
('achievement_seeker', 'Achievement Seeker', 'Check your achievements page for the first time.', 'learning', 'bronze', 10, '{"type": "achievement_page_visit", "immediate": true}'),

-- Very easy milestones (should be earned quickly)
('second_trade', 'Getting Started', 'Log your second trade - you are building momentum!', 'milestone', 'bronze', 15, '{"type": "trade_count", "count": 2}'),
('fifth_trade', 'Committed Trader', 'Log your fifth trade - you are showing real commitment!', 'milestone', 'bronze', 25, '{"type": "trade_count", "count": 5}'),
('tenth_trade', 'Regular Trader', 'Log your tenth trade - you are becoming a regular!', 'milestone', 'bronze', 40, '{"type": "trade_count", "count": 10}'),

-- Easy behavioral achievements
('first_profitable_trade', 'First Profit', 'Celebrate your first profitable trade!', 'performance', 'bronze', 20, '{"type": "first_profitable_trade"}'),
('risk_conscious', 'Risk Conscious', 'Set a stop loss on your first trade - great risk management!', 'behavioral', 'bronze', 30, '{"type": "first_stop_loss"}'),
('profit_taker', 'Profit Taker', 'Set a take profit on your first trade - planning for success!', 'behavioral', 'bronze', 30, '{"type": "first_take_profit"}'),

-- Engagement achievements
('weekend_warrior', 'Weekend Warrior', 'Log a trade on a weekend - dedication pays off!', 'behavioral', 'bronze', 20, '{"type": "weekend_trade"}'),
('early_bird', 'Early Bird', 'Log a trade before 9 AM - catching the early market moves!', 'behavioral', 'bronze', 20, '{"type": "early_trade", "before_hour": 9}'),
('night_owl', 'Night Owl', 'Log a trade after 8 PM - working the after-hours!', 'behavioral', 'bronze', 20, '{"type": "late_trade", "after_hour": 20}'),

-- Quick wins
('three_day_streak', 'Three Day Streak', 'Trade for three consecutive days - building habits!', 'behavioral', 'bronze', 50, '{"type": "trading_streak", "days": 3}'),
('diversified_trader', 'Diversified Trader', 'Trade 3 different symbols - spreading your wings!', 'learning', 'bronze', 35, '{"type": "different_symbols", "count": 3}');

-- Add some immediate criteria for existing users who might already qualify
UPDATE achievements 
SET criteria = jsonb_set(criteria, '{retroactive}', 'true')
WHERE key IN ('first_trade_logged', 'welcome_aboard', 'second_trade', 'fifth_trade', 'tenth_trade');