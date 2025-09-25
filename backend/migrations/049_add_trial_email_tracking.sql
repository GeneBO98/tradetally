-- Add email tracking columns to tier_overrides table for trial notifications
ALTER TABLE tier_overrides 
ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS expiration_sent_at TIMESTAMP;

-- Add indexes for better performance on scheduled queries
CREATE INDEX IF NOT EXISTS idx_tier_overrides_trial_expiry 
ON tier_overrides (expires_at, tier) 
WHERE reason ILIKE '%trial%';

CREATE INDEX IF NOT EXISTS idx_tier_overrides_reminder_tracking 
ON tier_overrides (reminder_sent_at, expiration_sent_at) 
WHERE reason ILIKE '%trial%';