-- Migration 165: Create user_acquisition table for registration source tracking
-- Captures UTM parameters, referral source, and registration context for marketing attribution

CREATE TABLE IF NOT EXISTS user_acquisition (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_term VARCHAR(255),
  utm_content VARCHAR(255),
  referral_source VARCHAR(255),
  registration_method VARCHAR(50) DEFAULT 'direct',
  landing_page VARCHAR(500),
  registration_ip INET,
  registration_user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_acquisition_source ON user_acquisition(utm_source);
CREATE INDEX idx_acquisition_campaign ON user_acquisition(utm_campaign);
CREATE INDEX idx_acquisition_medium ON user_acquisition(utm_medium);
