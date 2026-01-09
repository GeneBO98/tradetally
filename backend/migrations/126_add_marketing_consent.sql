-- Add marketing consent column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT FALSE;

-- Add index for querying users by marketing consent
CREATE INDEX IF NOT EXISTS idx_users_marketing_consent ON users(marketing_consent);
