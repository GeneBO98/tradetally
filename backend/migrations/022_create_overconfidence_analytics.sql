-- Create overconfidence analytics tables
-- This migration adds support for overconfidence detection and win streak tracking

-- Create overconfidence_events table for storing overconfidence instances
CREATE TABLE IF NOT EXISTS overconfidence_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    win_streak_length INTEGER NOT NULL, -- Number of consecutive wins
    win_streak_start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    win_streak_end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    baseline_position_size DECIMAL(15,2) NOT NULL, -- Average position size before streak
    peak_position_size DECIMAL(15,2) NOT NULL, -- Largest position size during streak
    position_size_increase_percent DECIMAL(5,2) NOT NULL, -- Percentage increase
    total_streak_profit DECIMAL(15,2) NOT NULL, -- Total profit during streak
    streak_trades UUID[] DEFAULT '{}', -- Array of trade IDs in the streak
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    confidence_score DECIMAL(3,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
    outcome_after_streak VARCHAR(20) CHECK (outcome_after_streak IN ('profit', 'loss', 'breakeven', 'ongoing')),
    outcome_trade_id UUID REFERENCES trades(id) ON DELETE SET NULL,
    outcome_amount DECIMAL(15,2), -- P&L of the trade that broke the streak
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create win_loss_streaks table for tracking current streak state
CREATE TABLE IF NOT EXISTS win_loss_streaks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    streak_type VARCHAR(10) NOT NULL CHECK (streak_type IN ('win', 'loss')),
    current_length INTEGER NOT NULL DEFAULT 0,
    streak_start_date TIMESTAMP WITH TIME ZONE,
    last_trade_date TIMESTAMP WITH TIME ZONE,
    total_pnl DECIMAL(15,2) NOT NULL DEFAULT 0,
    trade_ids UUID[] DEFAULT '{}', -- Current streak trade IDs
    baseline_position_size DECIMAL(15,2), -- Position size before current streak
    max_position_size DECIMAL(15,2), -- Largest position during current streak
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, is_active) -- Only one active streak per user
);

-- Create overconfidence_settings table for user preferences
CREATE TABLE IF NOT EXISTS overconfidence_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    detection_enabled BOOLEAN DEFAULT TRUE,
    min_streak_length INTEGER DEFAULT 4, -- Minimum wins to trigger analysis (adjusted for day trading)
    position_increase_threshold DECIMAL(5,2) DEFAULT 40.0, -- % increase to flag (adjusted for day trading)
    sensitivity VARCHAR(20) DEFAULT 'medium' CHECK (sensitivity IN ('low', 'medium', 'high')),
    alert_preferences JSONB DEFAULT '{"email": false, "push": true, "toast": true}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_overconfidence_events_user_id ON overconfidence_events(user_id);
CREATE INDEX IF NOT EXISTS idx_overconfidence_events_win_streak_start ON overconfidence_events(win_streak_start_date);
CREATE INDEX IF NOT EXISTS idx_overconfidence_events_severity ON overconfidence_events(severity);
CREATE INDEX IF NOT EXISTS idx_win_loss_streaks_user_id ON win_loss_streaks(user_id);
CREATE INDEX IF NOT EXISTS idx_win_loss_streaks_active ON win_loss_streaks(is_active);
CREATE INDEX IF NOT EXISTS idx_win_loss_streaks_type ON win_loss_streaks(streak_type);
CREATE INDEX IF NOT EXISTS idx_overconfidence_settings_user_id ON overconfidence_settings(user_id);

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_overconfidence_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_overconfidence_events_updated_at ON overconfidence_events;
CREATE TRIGGER update_overconfidence_events_updated_at
    BEFORE UPDATE ON overconfidence_events
    FOR EACH ROW
    EXECUTE FUNCTION update_overconfidence_updated_at();

DROP TRIGGER IF EXISTS update_win_loss_streaks_updated_at ON win_loss_streaks;
CREATE TRIGGER update_win_loss_streaks_updated_at
    BEFORE UPDATE ON win_loss_streaks
    FOR EACH ROW
    EXECUTE FUNCTION update_overconfidence_updated_at();

DROP TRIGGER IF EXISTS update_overconfidence_settings_updated_at ON overconfidence_settings;
CREATE TRIGGER update_overconfidence_settings_updated_at
    BEFORE UPDATE ON overconfidence_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_overconfidence_updated_at();

-- Add overconfidence analytics feature to features table
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active) VALUES
    ('overconfidence_analytics', 'Overconfidence Analytics', 'Detect overconfidence patterns from win streaks and position size increases', 'pro', true),
    ('overconfidence_alerts', 'Overconfidence Alerts', 'Real-time alerts for overconfidence behavior during trading', 'pro', true)
ON CONFLICT (feature_key) DO NOTHING;

-- Add overconfidence pattern types to existing behavioral_patterns table
-- (No schema changes needed - we'll use existing pattern_type field)

-- Add comments
COMMENT ON TABLE overconfidence_events IS 'Stores detected overconfidence events from win streaks';
COMMENT ON TABLE win_loss_streaks IS 'Tracks current win/loss streaks for real-time analysis';
COMMENT ON TABLE overconfidence_settings IS 'User preferences for overconfidence detection';
COMMENT ON COLUMN overconfidence_events.baseline_position_size IS 'Average position size in the 5 trades before the win streak';
COMMENT ON COLUMN overconfidence_events.peak_position_size IS 'Largest position size during the win streak';
COMMENT ON COLUMN overconfidence_events.position_size_increase_percent IS 'Percentage increase from baseline to peak';
COMMENT ON COLUMN win_loss_streaks.baseline_position_size IS 'Average position size before current streak started';