-- Add AI provider configuration columns to user_settings table
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(50) DEFAULT 'gemini',
ADD COLUMN IF NOT EXISTS ai_api_key TEXT,
ADD COLUMN IF NOT EXISTS ai_api_url TEXT,
ADD COLUMN IF NOT EXISTS ai_model VARCHAR(100);

-- Add check constraint for valid AI providers
ALTER TABLE user_settings 
ADD CONSTRAINT valid_ai_provider 
CHECK (ai_provider IN ('gemini', 'claude', 'openai', 'ollama', 'local'));

-- Add comment explaining the columns
COMMENT ON COLUMN user_settings.ai_provider IS 'AI provider for analytics and CUSIP lookup: gemini, claude, openai, ollama, or local';
COMMENT ON COLUMN user_settings.ai_api_key IS 'API key for the selected AI provider';
COMMENT ON COLUMN user_settings.ai_api_url IS 'Custom URL for local/ollama AI provider';
COMMENT ON COLUMN user_settings.ai_model IS 'Specific model name to use with the AI provider';