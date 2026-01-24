-- Migration: Add AI conversation sessions with credit system
-- This enables multi-turn AI conversations with follow-up questions
-- and a monthly credit system for Pro users (self-hosted users bypass credits)

-- AI conversation sessions
CREATE TABLE IF NOT EXISTS ai_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Context snapshot (filters, date range at session start)
    filters_applied JSONB DEFAULT '{}',
    trade_count INTEGER NOT NULL DEFAULT 0,

    -- Cached summary sent to AI (avoids re-querying trades)
    trade_summary JSONB NOT NULL DEFAULT '{}',

    -- Session limits
    followup_count INTEGER DEFAULT 0,
    max_followups INTEGER DEFAULT 5,

    -- Status
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'expired')),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE ai_sessions IS 'Stores AI conversation sessions for multi-turn interactions';
COMMENT ON COLUMN ai_sessions.filters_applied IS 'JSON snapshot of filters applied when session started';
COMMENT ON COLUMN ai_sessions.trade_summary IS 'Compressed trade summary sent to AI to avoid re-querying';
COMMENT ON COLUMN ai_sessions.followup_count IS 'Number of follow-up questions asked in this session';
COMMENT ON COLUMN ai_sessions.max_followups IS 'Maximum allowed follow-up questions per session';
COMMENT ON COLUMN ai_sessions.status IS 'Session status: active, closed, or expired';
COMMENT ON COLUMN ai_sessions.expires_at IS 'Session auto-expires after 24 hours of inactivity';

-- Messages within a session
CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    credits_used INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE ai_messages IS 'Stores messages within AI conversation sessions';
COMMENT ON COLUMN ai_messages.role IS 'Message role: user, assistant, or system';
COMMENT ON COLUMN ai_messages.credits_used IS 'Credits consumed for this message (assistant messages only)';

-- Monthly credit tracking
CREATE TABLE IF NOT EXISTS ai_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    credits_allocated INTEGER NOT NULL DEFAULT 100,
    credits_used INTEGER NOT NULL DEFAULT 0,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT ai_credits_user_period_unique UNIQUE(user_id, period_start)
);

COMMENT ON TABLE ai_credits IS 'Tracks monthly AI credit allocation and usage per user';
COMMENT ON COLUMN ai_credits.credits_allocated IS 'Total credits allocated for this period (Pro: 100)';
COMMENT ON COLUMN ai_credits.credits_used IS 'Credits used so far this period';
COMMENT ON COLUMN ai_credits.period_start IS 'First day of the billing period (month)';
COMMENT ON COLUMN ai_credits.period_end IS 'Last day of the billing period (month)';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_id ON ai_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_status ON ai_sessions(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_active ON ai_sessions(user_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ai_messages_session_id ON ai_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session_created ON ai_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_credits_user_period ON ai_credits(user_id, period_start);

-- Add trigger for updating updated_at timestamp on ai_sessions
CREATE OR REPLACE FUNCTION update_ai_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_sessions_updated_at_trigger ON ai_sessions;
CREATE TRIGGER ai_sessions_updated_at_trigger
    BEFORE UPDATE ON ai_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_sessions_updated_at();

-- Add trigger for updating updated_at timestamp on ai_credits
CREATE OR REPLACE FUNCTION update_ai_credits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_credits_updated_at_trigger ON ai_credits;
CREATE TRIGGER ai_credits_updated_at_trigger
    BEFORE UPDATE ON ai_credits
    FOR EACH ROW
    EXECUTE FUNCTION update_ai_credits_updated_at();
