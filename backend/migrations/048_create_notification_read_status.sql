-- Migration: Create notification read status tracking
-- This migration creates a table to track which notifications users have read
-- and adds functionality for deleting notifications

-- Create notification_read_status table
CREATE TABLE IF NOT EXISTS notification_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(50) NOT NULL, -- 'price_alert', 'trade_comment'
  notification_id UUID NOT NULL, -- References either alert_notifications.id or trade_comments.id
  read_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  
  -- Ensure one read status per user per notification
  UNIQUE(user_id, notification_type, notification_id)
);

-- Create indexes for performance
CREATE INDEX idx_notification_read_status_user_id ON notification_read_status(user_id);
CREATE INDEX idx_notification_read_status_notification ON notification_read_status(notification_type, notification_id);

-- Add deleted_at column to alert_notifications for soft deletes
ALTER TABLE alert_notifications 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;

-- Add deleted_at column to trade_comments for soft deletes (so we can hide them from notifications)
ALTER TABLE trade_comments 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;

-- Create indexes for deleted_at columns
CREATE INDEX idx_alert_notifications_deleted_at ON alert_notifications(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_trade_comments_deleted_at ON trade_comments(deleted_at) WHERE deleted_at IS NULL;

-- Comments
COMMENT ON TABLE notification_read_status IS 'Tracks which notifications each user has read';
COMMENT ON COLUMN notification_read_status.notification_type IS 'Type of notification: price_alert, trade_comment';
COMMENT ON COLUMN notification_read_status.notification_id IS 'ID of the notification in the respective table';
COMMENT ON COLUMN alert_notifications.deleted_at IS 'Soft delete timestamp for hiding notifications';
COMMENT ON COLUMN trade_comments.deleted_at IS 'Soft delete timestamp for hiding comment notifications';