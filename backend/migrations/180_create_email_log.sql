-- Migration 180: Create email_log table for outbound email auditing.
-- emailService.logEmail() writes one row per send/attempt; retention email
-- schedulers read it to enforce per-recipient throttling windows.

CREATE TABLE IF NOT EXISTS email_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient VARCHAR(320) NOT NULL,
  subject TEXT,
  email_type VARCHAR(64) NOT NULL,
  html_body TEXT,
  text_body TEXT,
  status VARCHAR(32) NOT NULL DEFAULT 'sent',
  error_message TEXT,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_log_user_type_sent_at
  ON email_log (user_id, email_type, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_log_status_sent_at
  ON email_log (status, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_log_recipient
  ON email_log (recipient);
