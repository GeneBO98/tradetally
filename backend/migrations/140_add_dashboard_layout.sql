-- Migration: Add dashboard layout preference to user_settings
-- This allows users to customize the order and visibility of sections on the dashboard page

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS dashboard_layout JSONB DEFAULT NULL;

COMMENT ON COLUMN user_settings.dashboard_layout IS 'Stores the user''s preferred order and visibility of sections on the dashboard page';
