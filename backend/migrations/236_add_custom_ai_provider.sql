-- Migration 236: Add the Custom OpenAI-compatible AI provider.
-- Keep legacy Local settings intact while aligning the database constraint
-- with every provider currently accepted by the application.

ALTER TABLE user_settings DROP CONSTRAINT IF EXISTS valid_ai_provider;

ALTER TABLE user_settings
ADD CONSTRAINT valid_ai_provider
CHECK (
  ai_provider IN (
    'gemini',
    'claude',
    'openai',
    'deepseek',
    'kimi',
    'ollama',
    'lmstudio',
    'perplexity',
    'local',
    'custom'
  )
);

COMMENT ON COLUMN user_settings.ai_provider IS
  'AI provider for analytics and CUSIP lookup: gemini, claude, openai, deepseek, kimi, ollama, lmstudio, perplexity, local, or custom';
