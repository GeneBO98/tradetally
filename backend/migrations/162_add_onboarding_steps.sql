-- Add step-based onboarding tracking
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS pro_onboarding_step INTEGER DEFAULT 0;
