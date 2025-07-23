-- Migration 044: Update leaderboards from behavioral-based to P&L-based system
-- This migration replaces the old behavioral leaderboards with meaningful P&L-based rankings

-- Clear existing leaderboard entries first
DELETE FROM leaderboard_entries;

-- Clear existing leaderboards
DELETE FROM leaderboards;

-- Insert the new P&L-based leaderboards
INSERT INTO leaderboards (key, name, description, metric_key, period_type, is_active) VALUES
('total_pnl', 'All-Time P&L Rankings', 'Total profit/loss across all trades', 'total_pnl', 'all_time', true),
('monthly_pnl', 'Monthly P&L Rankings', 'Profit/loss for the current month', 'monthly_pnl', 'monthly', true),
('weekly_pnl', 'Weekly P&L Rankings', 'Profit/loss for the current week', 'weekly_pnl', 'weekly', true),
('best_trade', 'Best Single Trade', 'Highest profit from a single trade', 'best_trade', 'all_time', true),
('worst_trade', 'Worst Single Trade', 'Largest loss from a single trade', 'worst_trade', 'all_time', true),
('consistency_score', 'Most Consistent Trader', 'Based on volume traded and average P&L', 'consistency_score', 'all_time', true);

-- The leaderboard service will automatically populate these with data when it runs