-- Track per-user notification dismissal without mutating source records.
ALTER TABLE notification_read_status
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;

CREATE INDEX IF NOT EXISTS idx_notification_read_status_user_visible
  ON notification_read_status(user_id, notification_type, notification_id)
  WHERE deleted_at IS NULL;
