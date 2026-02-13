-- Add onboarding_completed_at to user_settings for guided onboarding (first-time login modal)
ALTER TABLE user_settings ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
COMMENT ON COLUMN user_settings.onboarding_completed_at IS 'When the user completed or dismissed the guided onboarding flow; null means show onboarding';
