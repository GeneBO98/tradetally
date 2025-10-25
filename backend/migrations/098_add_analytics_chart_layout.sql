-- Migration: Add analytics chart layout preference to user_settings
-- This allows users to customize the order of charts on the analytics page

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS analytics_chart_layout JSONB DEFAULT NULL;

COMMENT ON COLUMN user_settings.analytics_chart_layout IS 'Stores the user''s preferred order of charts on the analytics page';
