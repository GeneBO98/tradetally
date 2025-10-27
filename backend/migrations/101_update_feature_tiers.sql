-- Update feature tiers to new Free/Pro structure
-- Free Tier: Basic journaling and core metrics
-- Pro Tier: Advanced analytics, behavioral insights, alerts, unlimited trades

-- Clear existing features
DELETE FROM features;

-- ========================================
-- FREE TIER FEATURES
-- ========================================

-- Dashboard (Free tier gets basic dashboard)
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('dashboard', 'Dashboard', 'Main dashboard with overview', 'free', true),
('news_feed', 'News Feed', 'Financial news integration', 'pro', true),
('earnings_calendar', 'Earnings Calendar', 'Upcoming earnings dates', 'pro', true);

-- Basic Journaling & Trades
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('basic_journaling', 'Basic Trade Journaling', 'Record and view trades with notes', 'free', true),
('trade_import', 'Trade Import', 'Import trades from brokers', 'free', true),
('trade_tagging', 'Trade Tags', 'Tag trades with strategies and setups', 'free', true);

-- Core Metrics (Free)
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('core_metrics', 'Core Metrics', 'P/L, win rate, profit factor, avg win/loss', 'free', true),
('basic_charts', 'Basic Charts', 'Equity curve, volume, daily performance', 'free', true),
('calendar_view', 'Calendar View', 'P/L per day calendar visualization', 'free', true);

-- Leaderboard (View Only)
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('leaderboard_view', 'Leaderboard View', 'View basic leaderboard rankings (limited)', 'free', true);

-- ========================================
-- PRO TIER FEATURES
-- ========================================

-- Unlimited Usage
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('unlimited_trades', 'Unlimited Trades', 'No limit on trade entries and imports', 'pro', true),
('unlimited_journals', 'Unlimited Journals', 'Unlimited trading journal entries', 'pro', true);

-- Advanced Analytics
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('advanced_analytics', 'Advanced Analytics', 'Complete suite of advanced trading metrics', 'pro', true),
('sqn_analysis', 'System Quality Number (SQN)', 'Van Tharp SQN calculation and tracking', 'pro', true),
('kelly_criterion', 'Kelly Criterion', 'Optimal position sizing calculation', 'pro', true),
('mae_mfe', 'MAE/MFE Analysis', 'Maximum Adverse/Favorable Excursion tracking', 'pro', true),
('k_ratio', 'K-Ratio', 'Risk-adjusted performance metric', 'pro', true),
('sector_breakdown', 'Sector Breakdown', 'Performance analysis by sector', 'pro', true),
('time_analysis', 'Time-of-Day Analysis', 'Performance by trading time/session', 'pro', true),
('day_of_week', 'Day of Week Analysis', 'Performance patterns by weekday', 'pro', true),
('symbol_analytics', 'Symbol Analytics', 'Detailed per-symbol performance', 'pro', true),
('strategy_analytics', 'Strategy Analytics', 'Detailed per-strategy performance', 'pro', true);

-- Behavioral Analytics Suite
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('behavioral_analytics', 'Behavioral Analytics', 'Complete behavioral pattern analysis', 'pro', true),
('revenge_trading_detection', 'Revenge Trading Detection', 'Detect and prevent revenge trading', 'pro', true),
('overconfidence_analytics', 'Overconfidence Analytics', 'Win streak overconfidence detection', 'pro', true),
('loss_aversion', 'Loss Aversion Analysis', 'Holding losers too long analysis', 'pro', true),
('personality_typing', 'Trading Personality', 'Trading personality profiling', 'pro', true),
('behavioral_alerts', 'Behavioral Alerts', 'Real-time behavioral pattern alerts', 'pro', true);

-- Health Analytics
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('health_analytics', 'Health Analytics', 'Health metrics correlation with trading', 'pro', true),
('heart_rate_tracking', 'Heart Rate Tracking', 'Track heart rate during trading', 'pro', true),
('sleep_tracking', 'Sleep Tracking', 'Sleep quality correlation with performance', 'pro', true),
('stress_tracking', 'Stress Tracking', 'Stress level tracking and correlation', 'pro', true);

-- Watchlists & Alerts
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('watchlists', 'Stock Watchlists', 'Create and manage stock watchlists', 'pro', true),
('price_alerts', 'Price Alerts', 'Real-time price alerts', 'pro', true),
('email_alerts', 'Email Alerts', 'Email notifications for alerts', 'pro', true),
('push_notifications', 'Push Notifications', 'iOS push notifications', 'pro', true),
('realtime_monitoring', 'Real-time Price Monitoring', 'Live price tracking and monitoring', 'pro', true);

-- Advanced Leaderboard
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('leaderboard_filters', 'Advanced Leaderboard', 'Filter by strategy, timeframe, and more', 'pro', true),
('leaderboard_compete', 'Leaderboard Competition', 'Participate in leaderboard rankings', 'pro', true);

-- API Access
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('api_access', 'API Access', 'Full REST API access for integrations', 'pro', true),
('webhooks', 'Webhooks', 'Webhook support for external integrations', 'pro', true);

-- AI Features
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('ai_insights', 'AI Insights', 'AI-powered trading insights and recommendations', 'pro', true),
('ai_trade_analysis', 'AI Trade Analysis', 'AI analysis of individual trades', 'pro', true);

-- Additional Pro Features
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
('advanced_filtering', 'Advanced Filtering', 'Advanced trade filtering and search', 'pro', true),
('custom_metrics', 'Custom Metrics', 'Create custom performance metrics', 'pro', true),
('export_reports', 'Export Reports', 'Export detailed reports and analytics', 'pro', true),
('trade_blocking', 'Automatic Trade Blocking', 'Block trades based on behavioral triggers', 'pro', true);

-- Add comments
COMMENT ON TABLE features IS 'Feature definitions and tier requirements - updated for Free/Pro model';
