-- Migration 163: Create user_activity_events table for granular activity tracking
-- Captures all meaningful user actions for marketing, analytics, and CRM

CREATE TABLE IF NOT EXISTS user_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(100) NOT NULL,
  event_category VARCHAR(50) NOT NULL,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  session_id VARCHAR(100),
  response_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Primary query indexes
CREATE INDEX idx_activity_events_user_created ON user_activity_events(user_id, created_at DESC);
CREATE INDEX idx_activity_events_type_created ON user_activity_events(event_type, created_at DESC);
CREATE INDEX idx_activity_events_category ON user_activity_events(event_category, created_at DESC);
CREATE INDEX idx_activity_events_created ON user_activity_events(created_at DESC);
-- For session analysis
CREATE INDEX idx_activity_events_session ON user_activity_events(session_id, created_at) WHERE session_id IS NOT NULL;
