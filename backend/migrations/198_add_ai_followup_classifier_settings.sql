-- Admin-configurable lightweight model for AI follow-up scope checks.
-- Stored in admin_settings because the table is key-value based.

INSERT INTO admin_settings (setting_key, setting_value)
VALUES
  ('default_ai_classifier_enabled', 'false'),
  ('default_ai_classifier_provider', ''),
  ('default_ai_classifier_api_key', ''),
  ('default_ai_classifier_api_url', ''),
  ('default_ai_classifier_model', '')
ON CONFLICT (setting_key) DO NOTHING;
