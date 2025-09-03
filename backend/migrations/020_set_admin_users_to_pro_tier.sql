-- Set all existing admin and owner users to Pro tier
-- This ensures admins get Pro tier by default

UPDATE users 
SET tier = 'pro', updated_at = CURRENT_TIMESTAMP
WHERE role IN ('admin', 'owner') AND tier = 'free';

-- Add comment explaining the change
COMMENT ON COLUMN users.tier IS 'User subscription tier: free or pro (admins get pro by default)';