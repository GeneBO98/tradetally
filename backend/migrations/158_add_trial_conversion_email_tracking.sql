-- Track when conversion emails are sent to prevent duplicate sends
ALTER TABLE tier_overrides ADD COLUMN IF NOT EXISTS conversion_email_sent_at TIMESTAMP;
