ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS ai_analysis_instructions TEXT NOT NULL DEFAULT '';
ALTER TABLE user_settings ADD CONSTRAINT ai_analysis_instructions_length CHECK (char_length(ai_analysis_instructions) <= 6000);
