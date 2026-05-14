ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS ui_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN user_settings.ui_preferences
  IS 'Cross-device UI preferences synced from the web client (dark mode, trade list columns, view filters, etc.). Free-form JSON keyed by preference name.';
