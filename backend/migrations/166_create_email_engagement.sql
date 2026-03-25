-- Migration 166: Create email_engagement table for email interaction tracking
-- Tracks email sends, opens (via tracking pixel), and clicks (via redirect links)

CREATE TABLE IF NOT EXISTS email_engagement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email_type VARCHAR(50) NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  opened_at TIMESTAMP WITH TIME ZONE,
  clicked_at TIMESTAMP WITH TIME ZONE,
  tracking_id VARCHAR(100) UNIQUE,
  click_url TEXT,
  metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_email_engagement_user ON email_engagement(user_id, sent_at DESC);
CREATE INDEX idx_email_engagement_type ON email_engagement(email_type, sent_at DESC);
CREATE INDEX idx_email_engagement_tracking ON email_engagement(tracking_id);
