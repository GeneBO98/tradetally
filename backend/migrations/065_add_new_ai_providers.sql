-- Migration 065: Add support for new AI providers (perplexity, lmstudio)
-- Date: 2025-09-29

-- Drop the existing constraint
ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS valid_ai_provider;

-- Add new constraint with additional providers
ALTER TABLE user_settings 
ADD CONSTRAINT valid_ai_provider 
CHECK (ai_provider IN ('gemini', 'claude', 'openai', 'ollama', 'lmstudio', 'perplexity', 'local'));

-- Update the comment to reflect new providers
COMMENT ON COLUMN user_settings.ai_provider IS 'AI provider for analytics and CUSIP lookup: gemini, claude, openai, ollama, lmstudio, perplexity, or local';