-- Migration to add 2FA (Two-Factor Authentication) support
-- Adds columns to store 2FA secret and status

ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[]; -- Array of backup codes
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMP;

-- Index for faster 2FA lookups
CREATE INDEX IF NOT EXISTS idx_users_two_factor_enabled ON users(two_factor_enabled);

-- Add comment explaining the purpose
COMMENT ON COLUMN users.two_factor_secret IS 'Base32 encoded secret for TOTP 2FA';
COMMENT ON COLUMN users.two_factor_enabled IS 'Whether 2FA is enabled for this user';
COMMENT ON COLUMN users.two_factor_backup_codes IS 'Array of one-time backup codes for account recovery';
COMMENT ON COLUMN users.two_factor_enabled_at IS 'Timestamp when 2FA was first enabled';