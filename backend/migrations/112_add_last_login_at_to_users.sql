-- Add last_login_at column to users table for login analytics
-- This column is updated on each successful login to track user activity

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient queries on login time ranges
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);

-- Initialize last_login_at for existing users based on their most recent refresh token
UPDATE users u
SET last_login_at = (
  SELECT MAX(created_at)
  FROM refresh_tokens rt
  WHERE rt.user_id = u.id
)
WHERE last_login_at IS NULL;

COMMENT ON COLUMN users.last_login_at IS 'Timestamp of user last successful login';
