-- Add comprehensive trading achievements

INSERT INTO achievements (key, name, description, category, difficulty, points, criteria) VALUES

-- Daily and time-based achievements
('first_trade_daily', 'First Trade', 'Execute your first trade of the day', 'milestone', 'bronze', 50, '{"type": "first_trade_daily"}'),
('quick_flip', 'Quick Flip', 'Make a profitable trade within 5 minutes of opening the position', 'performance', 'silver', 100, '{"type": "quick_flip", "max_duration_minutes": 5}'),
('green_day', 'Green Day', 'End the trading day with a positive portfolio balance', 'performance', 'silver', 200, '{"type": "green_day"}'),
('streak_master', 'Streak Master', 'Achieve 5 consecutive profitable trading days', 'performance', 'gold', 500, '{"type": "profitable_streak", "days": 5}'),
('early_bird_market_open', 'Early Bird', 'Place a trade within the first 10 minutes of market open', 'behavioral', 'bronze', 75, '{"type": "early_market_trade", "minutes_from_open": 10}'),

-- Risk and strategy achievements
('risk_taker', 'Risk Taker', 'Execute a trade with a risk-reward ratio of at least 1:3', 'behavioral', 'silver', 150, '{"type": "risk_reward_ratio", "min_ratio": 3.0}'),
('trend_rider', 'Trend Rider', 'Profit from a trade by following a confirmed trend', 'learning', 'silver', 200, '{"type": "trend_following_profit"}'),
('news_trader', 'News Trader', 'Make a profitable trade based on a news catalyst', 'learning', 'gold', 300, '{"type": "news_based_profit"}'),

-- Volume achievements
('volume_king_i', 'Volume King', 'Trade a total of 1,000 shares in a single day', 'milestone', 'bronze', 100, '{"type": "daily_volume", "shares": 1000}'),
('volume_king_ii', 'Volume King II', 'Trade a total of 10,000 shares in a single day', 'milestone', 'silver', 300, '{"type": "daily_volume", "shares": 10000}'),
('volume_king_iii', 'Volume King III', 'Trade a total of 100,000 shares in a single day', 'milestone', 'gold', 500, '{"type": "daily_volume", "shares": 100000}'),

-- Profit achievements
('big_win_i', 'Big Win', 'Earn a profit of $500 or more on a single trade', 'performance', 'silver', 400, '{"type": "single_trade_profit", "min_profit": 500}'),
('big_win_ii', 'Big Win II', 'Earn a profit of $1000 or more on a single trade', 'performance', 'gold', 600, '{"type": "single_trade_profit", "min_profit": 1000}'),
('big_win_iii', 'Big Win III', 'Earn a profit of $1500 or more on a single trade', 'performance', 'gold', 800, '{"type": "single_trade_profit", "min_profit": 1500}'),

-- Position size achievements
('high_roller_i', 'High Roller', 'Execute a trade with a position size of $5,000 or more', 'milestone', 'silver', 350, '{"type": "position_size", "min_size": 5000}'),
('high_roller_ii', 'High Roller II', 'Execute a trade with a position size of $10,000 or more', 'milestone', 'gold', 550, '{"type": "position_size", "min_size": 10000}'),
('high_roller_iii', 'High Roller III', 'Execute a trade with a position size of $25,000 or more', 'milestone', 'gold', 750, '{"type": "position_size", "min_size": 25000}'),

-- Diversification and portfolio achievements
('diversifier', 'Diversifier', 'Trade in 5 different sectors in one day', 'learning', 'silver', 250, '{"type": "daily_sector_diversity", "min_sectors": 5}'),
('portfolio_booster', 'Portfolio Booster', 'Achieve a 5% portfolio gain in a single week', 'performance', 'gold', 750, '{"type": "weekly_portfolio_gain", "min_percentage": 5.0}');

-- Update some existing achievements to avoid conflicts
UPDATE achievements 
SET name = 'Trading Explorer', description = 'Log your very first trade - welcome to the trading world!'
WHERE key = 'first_trade_logged';

UPDATE achievements 
SET name = 'Early Bird Trader', description = 'Log a trade before 9 AM - catching the early market moves!'
WHERE key = 'early_bird';