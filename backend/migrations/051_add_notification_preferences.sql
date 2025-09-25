-- Add notification preferences columns to users table
-- This allows users to control what types of notifications they want to receive

-- Add notification preference columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_news_open_positions BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_earnings_announcements BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_price_alerts BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_trade_reminders BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_market_events BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN users.notify_news_open_positions IS 'Send notifications about news events affecting open positions';
COMMENT ON COLUMN users.notify_earnings_announcements IS 'Send notifications about earnings announcements for watched symbols';
COMMENT ON COLUMN users.notify_price_alerts IS 'Send notifications for price alerts and watchlist triggers';
COMMENT ON COLUMN users.notify_trade_reminders IS 'Send notifications for trade-related reminders and updates';
COMMENT ON COLUMN users.notify_market_events IS 'Send notifications about general market events and updates';

-- Update existing users to have notification preferences enabled by default
UPDATE users 
SET 
  notify_news_open_positions = true,
  notify_earnings_announcements = true,
  notify_price_alerts = true,
  notify_trade_reminders = true,
  notify_market_events = false
WHERE 
  notify_news_open_positions IS NULL 
  OR notify_earnings_announcements IS NULL 
  OR notify_price_alerts IS NULL 
  OR notify_trade_reminders IS NULL 
  OR notify_market_events IS NULL;