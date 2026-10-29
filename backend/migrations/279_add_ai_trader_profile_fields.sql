-- Migration 279: free-text trading self-description and AI memory notes
--
-- The trading profile chips (strategies, styles, risk tolerance, ...) are
-- coarse. `about_trading` lets the trader describe their approach, rules and
-- what they are working on in their own words. `ai_memory_notes` is a short
-- list of facts the trader wants every AI feature to remember across sessions
-- (e.g. "I overtrade after green days"). Both are injected into every AI
-- prompt via the shared trader dossier (aiTraderContext.js).

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS about_trading TEXT,
  ADD COLUMN IF NOT EXISTS ai_memory_notes JSONB NOT NULL DEFAULT '[]'::jsonb;
