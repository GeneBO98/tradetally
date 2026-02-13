-- Track when we last sent a re-engagement email so we don't spam inactive users
ALTER TABLE users ADD COLUMN IF NOT EXISTS reengagement_email_sent_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
COMMENT ON COLUMN users.reengagement_email_sent_at IS 'Last time we sent an inactive re-engagement email; used to throttle to at most once per 14 days';
