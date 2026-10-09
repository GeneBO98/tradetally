-- New users inherit the instance AI configuration until they configure their own.
ALTER TABLE user_settings ALTER COLUMN ai_provider SET DEFAULT NULL;

-- Repair untouched rows created by the historical Gemini column default.
-- Preserve all explicitly configured keys, URLs, models, and other providers.
UPDATE user_settings
SET ai_provider = NULL
WHERE ai_provider = 'gemini'
  AND BTRIM(COALESCE(ai_api_key, '')) = ''
  AND BTRIM(COALESCE(ai_api_url, '')) = ''
  AND BTRIM(COALESCE(ai_model, '')) = '';
