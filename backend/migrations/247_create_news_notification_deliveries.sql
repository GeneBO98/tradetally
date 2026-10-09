-- Keep article delivery receipts separate from notification history so clearing
-- or deleting a notification does not deliver the same article again.
CREATE TABLE IF NOT EXISTS news_notification_deliveries (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  article_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, article_key)
);
