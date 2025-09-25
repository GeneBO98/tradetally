-- Migration: Add push notification support tables
-- This migration adds the required tables for iOS push notifications

-- Create device_tokens table for APNS device tokens
CREATE TABLE IF NOT EXISTS device_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_token VARCHAR(500) NOT NULL,
    platform VARCHAR(20) NOT NULL CHECK (platform IN ('ios', 'android')),
    environment VARCHAR(20) DEFAULT 'production' CHECK (environment IN ('development', 'production')),
    bundle_id VARCHAR(255) DEFAULT 'com.tradetally.app',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(user_id, device_token)
);

-- Create notification_preferences table
CREATE TABLE IF NOT EXISTS notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    price_alerts_enabled BOOLEAN DEFAULT TRUE,
    earnings_enabled BOOLEAN DEFAULT TRUE,
    news_enabled BOOLEAN DEFAULT FALSE,
    email_notifications BOOLEAN DEFAULT TRUE,
    push_notifications BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create alert_notifications table for notification history
CREATE TABLE IF NOT EXISTS alert_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    price_alert_id UUID, -- Can be NULL for system notifications
    symbol VARCHAR(10),
    notification_type VARCHAR(50) NOT NULL CHECK (notification_type IN ('price_alert', 'trade_execution', 'earnings', 'news', 'system')),
    trigger_price DECIMAL(15,4),
    target_price DECIMAL(15,4),
    change_percent DECIMAL(8,4),
    message TEXT NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP WITH TIME ZONE,
    push_sent BOOLEAN DEFAULT FALSE,
    email_sent BOOLEAN DEFAULT FALSE
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_active ON device_tokens(active);
CREATE INDEX IF NOT EXISTS idx_device_tokens_platform ON device_tokens(platform);

CREATE INDEX IF NOT EXISTS idx_notification_preferences_user_id ON notification_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_alert_notifications_user_id ON alert_notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_sent_at ON alert_notifications(sent_at);
CREATE INDEX IF NOT EXISTS idx_alert_notifications_symbol ON alert_notifications(symbol);

-- Add updated_at triggers for the new tables
CREATE TRIGGER update_device_tokens_updated_at 
    BEFORE UPDATE ON device_tokens 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_notification_preferences_updated_at 
    BEFORE UPDATE ON notification_preferences 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE device_tokens IS 'Stores APNS device tokens for push notifications';
COMMENT ON TABLE notification_preferences IS 'User preferences for different types of notifications';
COMMENT ON TABLE alert_notifications IS 'History of all notifications sent to users';