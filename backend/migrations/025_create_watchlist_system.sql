-- Migration: Create watchlist and price alert system for Pro users
-- Allows Pro users to track symbols and receive notifications when price targets are reached

-- Table for user watchlists
CREATE TABLE IF NOT EXISTS watchlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT watchlists_name_user_unique UNIQUE(user_id, name)
);

-- Table for watchlist items (symbols in watchlists)
CREATE TABLE IF NOT EXISTS watchlist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  watchlist_id UUID NOT NULL REFERENCES watchlists(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  
  CONSTRAINT watchlist_items_symbol_unique UNIQUE(watchlist_id, symbol)
);

-- Table for price alerts
CREATE TABLE IF NOT EXISTS price_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  alert_type VARCHAR(20) NOT NULL, -- 'above', 'below', 'change_percent'
  target_price DECIMAL(15,4), -- Target price for 'above'/'below' alerts
  change_percent DECIMAL(5,2), -- Target percentage for 'change_percent' alerts
  current_price DECIMAL(15,4), -- Price when alert was created (for reference)
  is_active BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  browser_enabled BOOLEAN DEFAULT TRUE,
  repeat_enabled BOOLEAN DEFAULT FALSE, -- Whether to re-trigger after being triggered
  triggered_at TIMESTAMP NULL, -- When the alert was last triggered
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure at least one notification method is enabled
  CONSTRAINT price_alerts_notification_check CHECK (email_enabled = TRUE OR browser_enabled = TRUE),
  -- Ensure proper alert configuration
  CONSTRAINT price_alerts_config_check CHECK (
    (alert_type IN ('above', 'below') AND target_price IS NOT NULL) OR
    (alert_type = 'change_percent' AND change_percent IS NOT NULL)
  )
);

-- Table for alert notifications history
CREATE TABLE IF NOT EXISTS alert_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_alert_id UUID NOT NULL REFERENCES price_alerts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(10) NOT NULL,
  notification_type VARCHAR(20) NOT NULL, -- 'email', 'browser'
  trigger_price DECIMAL(15,4) NOT NULL,
  target_price DECIMAL(15,4),
  change_percent DECIMAL(5,2),
  message TEXT NOT NULL,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivery_status VARCHAR(20) DEFAULT 'sent', -- 'sent', 'failed', 'delivered'
  error_message TEXT
);

-- Table for real-time price monitoring (cache recent prices)
CREATE TABLE IF NOT EXISTS price_monitoring (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(10) NOT NULL,
  current_price DECIMAL(15,4) NOT NULL,
  previous_price DECIMAL(15,4),
  price_change DECIMAL(15,4),
  percent_change DECIMAL(5,2),
  volume BIGINT,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data_source VARCHAR(20) DEFAULT 'finnhub', -- 'finnhub', 'alpha_vantage'
  
  CONSTRAINT price_monitoring_symbol_unique UNIQUE(symbol)
);

-- Indexes for performance
CREATE INDEX idx_watchlists_user ON watchlists(user_id);
CREATE INDEX idx_watchlist_items_watchlist ON watchlist_items(watchlist_id);
CREATE INDEX idx_watchlist_items_symbol ON watchlist_items(symbol);
CREATE INDEX idx_price_alerts_user ON price_alerts(user_id);
CREATE INDEX idx_price_alerts_symbol ON price_alerts(symbol);
CREATE INDEX idx_price_alerts_active ON price_alerts(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_price_alerts_triggered ON price_alerts(triggered_at);
CREATE INDEX idx_alert_notifications_user ON alert_notifications(user_id);
CREATE INDEX idx_alert_notifications_alert ON alert_notifications(price_alert_id);
CREATE INDEX idx_alert_notifications_sent ON alert_notifications(sent_at DESC);
CREATE INDEX idx_price_monitoring_symbol ON price_monitoring(symbol);
CREATE INDEX idx_price_monitoring_updated ON price_monitoring(last_updated DESC);

-- Create default watchlist for existing Pro users
INSERT INTO watchlists (user_id, name, is_default)
SELECT id, 'My Watchlist', TRUE
FROM users 
WHERE tier = 'pro' 
AND NOT EXISTS (SELECT 1 FROM watchlists WHERE user_id = users.id AND is_default = TRUE);

-- Add watchlist features to the features table
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active)
VALUES 
  ('watchlists', 'Stock Watchlists', 'Create and manage stock watchlists with real-time tracking', 'pro', TRUE),
  ('price_alerts', 'Price Alerts', 'Set up email and browser notifications for price targets', 'pro', TRUE),
  ('realtime_monitoring', 'Real-time Price Monitoring', 'Real-time price updates and monitoring for watchlist items', 'pro', TRUE)
ON CONFLICT (feature_key) DO NOTHING;

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_watchlists_updated_at 
  BEFORE UPDATE ON watchlists 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_price_alerts_updated_at 
  BEFORE UPDATE ON price_alerts 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View for watchlist summary with item counts
CREATE OR REPLACE VIEW watchlist_summary AS
SELECT 
  w.id,
  w.user_id,
  w.name,
  w.description,
  w.is_default,
  w.created_at,
  w.updated_at,
  COUNT(wi.id) as item_count,
  COUNT(pa.id) as alert_count
FROM watchlists w
LEFT JOIN watchlist_items wi ON w.id = wi.watchlist_id
LEFT JOIN price_alerts pa ON w.user_id = pa.user_id 
  AND pa.symbol IN (SELECT symbol FROM watchlist_items WHERE watchlist_id = w.id)
  AND pa.is_active = TRUE
GROUP BY w.id, w.user_id, w.name, w.description, w.is_default, w.created_at, w.updated_at;

-- View for active alerts with current prices
CREATE OR REPLACE VIEW active_alerts_with_prices AS
SELECT 
  pa.id,
  pa.user_id,
  pa.symbol,
  pa.alert_type,
  pa.target_price,
  pa.change_percent,
  pa.current_price as alert_creation_price,
  pa.email_enabled,
  pa.browser_enabled,
  pa.repeat_enabled,
  pa.created_at,
  pm.current_price,
  pm.percent_change,
  pm.last_updated as price_last_updated,
  u.email,
  us.email_notifications as user_email_enabled
FROM price_alerts pa
JOIN users u ON pa.user_id = u.id
LEFT JOIN user_settings us ON u.id = us.user_id
LEFT JOIN price_monitoring pm ON pa.symbol = pm.symbol
WHERE pa.is_active = TRUE
AND u.tier = 'pro';