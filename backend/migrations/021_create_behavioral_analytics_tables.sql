-- Create behavioral analytics tables
-- This migration adds support for behavioral pattern detection and analysis

-- Create behavioral_patterns table for storing user behavior metrics
CREATE TABLE IF NOT EXISTS behavioral_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_type VARCHAR(50) NOT NULL, -- 'revenge_trading', 'overtrading', 'fomo', etc.
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    trigger_trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
    context_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create behavioral_alerts table for tracking alerts and user responses
CREATE TABLE IF NOT EXISTS behavioral_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pattern_id UUID REFERENCES behavioral_patterns(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL, -- 'warning', 'recommendation', 'blocking', etc.
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    alert_data JSONB DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'dismissed', 'expired')),
    shown_at TIMESTAMP WITH TIME ZONE,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    user_response JSONB DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create revenge_trading_events table for specific revenge trading instances
CREATE TABLE IF NOT EXISTS revenge_trading_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    trigger_trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
    trigger_loss_amount DECIMAL(15,2),
    trigger_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    revenge_trades UUID[] DEFAULT '{}', -- Array of trade IDs that were part of revenge trading
    total_revenge_trades INTEGER NOT NULL DEFAULT 0,
    time_window_minutes INTEGER NOT NULL, -- How many minutes the revenge trading lasted
    position_size_increase_percent DECIMAL(5,2), -- Percentage increase in position size
    total_additional_loss DECIMAL(15,2), -- Additional loss from revenge trading
    pattern_broken BOOLEAN DEFAULT FALSE, -- Whether user successfully broke the pattern
    cooling_period_used BOOLEAN DEFAULT FALSE, -- Whether user used cooling period
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create behavioral_settings table for user preferences
CREATE TABLE IF NOT EXISTS behavioral_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revenge_trading_enabled BOOLEAN DEFAULT TRUE,
    revenge_trading_sensitivity VARCHAR(20) DEFAULT 'medium' CHECK (revenge_trading_sensitivity IN ('low', 'medium', 'high')),
    cooling_period_minutes INTEGER DEFAULT 30,
    enable_trade_blocking BOOLEAN DEFAULT FALSE,
    alert_preferences JSONB DEFAULT '{"email": false, "push": true, "toast": true}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_user_id ON behavioral_patterns(user_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_type ON behavioral_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_behavioral_patterns_detected_at ON behavioral_patterns(detected_at);
CREATE INDEX IF NOT EXISTS idx_behavioral_alerts_user_id ON behavioral_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_alerts_status ON behavioral_alerts(status);
CREATE INDEX IF NOT EXISTS idx_revenge_trading_events_user_id ON revenge_trading_events(user_id);
CREATE INDEX IF NOT EXISTS idx_revenge_trading_events_trigger_timestamp ON revenge_trading_events(trigger_timestamp);
CREATE INDEX IF NOT EXISTS idx_behavioral_settings_user_id ON behavioral_settings(user_id);

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_behavioral_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_behavioral_patterns_updated_at ON behavioral_patterns;
CREATE TRIGGER update_behavioral_patterns_updated_at
    BEFORE UPDATE ON behavioral_patterns
    FOR EACH ROW
    EXECUTE FUNCTION update_behavioral_updated_at();

DROP TRIGGER IF EXISTS update_behavioral_alerts_updated_at ON behavioral_alerts;
CREATE TRIGGER update_behavioral_alerts_updated_at
    BEFORE UPDATE ON behavioral_alerts
    FOR EACH ROW
    EXECUTE FUNCTION update_behavioral_updated_at();

DROP TRIGGER IF EXISTS update_revenge_trading_events_updated_at ON revenge_trading_events;
CREATE TRIGGER update_revenge_trading_events_updated_at
    BEFORE UPDATE ON revenge_trading_events
    FOR EACH ROW
    EXECUTE FUNCTION update_behavioral_updated_at();

DROP TRIGGER IF EXISTS update_behavioral_settings_updated_at ON behavioral_settings;
CREATE TRIGGER update_behavioral_settings_updated_at
    BEFORE UPDATE ON behavioral_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_behavioral_updated_at();

-- Add behavioral analytics feature to features table
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
    ('behavioral_analytics', 'Behavioral Analytics', 'Advanced behavioral pattern detection and analysis including revenge trading detection', 'pro', true),
    ('revenge_trading_detection', 'Revenge Trading Detection', 'Detect and alert on revenge trading patterns', 'pro', true),
    ('behavioral_alerts', 'Behavioral Alerts', 'Real-time alerts for problematic trading behaviors', 'pro', true),
    ('trade_blocking', 'Trade Blocking', 'Automatic trade blocking during high-risk periods', 'pro', true)
ON CONFLICT (feature_key) DO NOTHING;

-- Add comments
COMMENT ON TABLE behavioral_patterns IS 'Stores detected behavioral patterns for users';
COMMENT ON TABLE behavioral_alerts IS 'Tracks alerts sent to users about behavioral patterns';
COMMENT ON TABLE revenge_trading_events IS 'Specific instances of revenge trading behavior';
COMMENT ON TABLE behavioral_settings IS 'User preferences for behavioral analytics features';