-- Health Data Integration Tables
-- Creates tables to store health data from mobile devices and correlate with trading performance

-- Main health data table storing sleep and heart rate metrics
CREATE TABLE IF NOT EXISTS health_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    data_type VARCHAR(50) NOT NULL, -- 'sleep' or 'heart_rate'
    value DECIMAL(10,2) NOT NULL,
    metadata JSONB DEFAULT '{}', -- Additional data like sleep quality, HRV, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, date, data_type)
);

-- Health-Trading correlation analysis results
CREATE TABLE IF NOT EXISTS health_trading_correlations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    analysis_date DATE NOT NULL,
    date_range_start DATE NOT NULL,
    date_range_end DATE NOT NULL,
    sleep_hours DECIMAL(4,2),
    sleep_quality DECIMAL(3,2),
    avg_heart_rate DECIMAL(6,2),
    heart_rate_variability DECIMAL(8,4),
    total_pnl DECIMAL(15,2),
    win_rate DECIMAL(5,2),
    total_trades INTEGER,
    average_pnl DECIMAL(15,2),
    correlation_score DECIMAL(4,3), -- -1.0 to 1.0
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Health insights generated from correlation analysis
CREATE TABLE IF NOT EXISTS health_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    insight_type VARCHAR(50) NOT NULL, -- 'sleep_quality', 'heart_rate', 'overall'
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    confidence DECIMAL(3,2) NOT NULL, -- 0.0 to 1.0
    is_actionable BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days'
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_health_data_user_date ON health_data(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_health_data_type ON health_data(data_type);
CREATE INDEX IF NOT EXISTS idx_health_correlations_user ON health_trading_correlations(user_id, analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_health_insights_user ON health_insights(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_insights_expires ON health_insights(expires_at);

-- Create subscription_features table if it doesn't exist
CREATE TABLE IF NOT EXISTS subscription_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_name VARCHAR(100) NOT NULL UNIQUE,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    tier_required VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add health integration feature to subscription features if not exists
INSERT INTO subscription_features (feature_name, display_name, description, tier_required) 
VALUES ('health_integration', 'Health Integration', 'Correlate health data with trading performance', 'pro')
ON CONFLICT (feature_name) DO NOTHING;

-- Update existing pro users to have access to health integration (simplified for UUID schema)
-- Since this database uses tier directly in users table, we'll create the user_subscription_features table structure
CREATE TABLE IF NOT EXISTS user_subscription_features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature_name VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, feature_name)
);

-- Enable health integration for all existing pro/admin users
INSERT INTO user_subscription_features (user_id, feature_name, enabled) 
SELECT u.id, 'health_integration', true 
FROM users u 
WHERE u.tier IN ('pro', 'admin') 
ON CONFLICT (user_id, feature_name) DO NOTHING;

-- Function to clean up expired insights
CREATE OR REPLACE FUNCTION cleanup_expired_health_insights() RETURNS void AS $$
BEGIN
    DELETE FROM health_insights WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup (can be called by a cron job)
COMMENT ON FUNCTION cleanup_expired_health_insights() IS 'Removes expired health insights to keep the table clean';