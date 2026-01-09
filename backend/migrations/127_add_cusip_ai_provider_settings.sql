-- Add CUSIP-specific AI provider settings to user_settings
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS cusip_ai_provider VARCHAR(50);
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS cusip_ai_api_key TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS cusip_ai_api_url TEXT;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS cusip_ai_model VARCHAR(100);

-- Add admin default settings for CUSIP AI provider
INSERT INTO admin_settings (key, value, description, created_at, updated_at)
VALUES
  ('default_cusip_ai_provider', '', 'Default AI provider for CUSIP resolution (empty = use main AI provider)', NOW(), NOW()),
  ('default_cusip_ai_api_key', '', 'Default API key for CUSIP AI provider', NOW(), NOW()),
  ('default_cusip_ai_api_url', '', 'Default API URL for CUSIP AI provider (for local providers)', NOW(), NOW()),
  ('default_cusip_ai_model', '', 'Default model for CUSIP AI provider', NOW(), NOW())
ON CONFLICT (key) DO NOTHING;
