-- Account lockout after repeated failed logins, resolved via an emailed unlock
-- link. Lockout is only ENFORCED when email is configured (see
-- isAccountLockoutEnabled in auth.controller.js) so self-hosters without SMTP
-- are never locked out of their own instance.
--
-- failed_login_attempts : consecutive failed password attempts; reset to 0 on
--                         a successful password verification or on unlock.
-- account_locked_at     : set when the attempt threshold is reached; NULL means
--                         not locked.
-- unlock_token          : SHA-256 lookup hash of the emailed unlock token
--                         (same hashing scheme as reset_token).
-- unlock_expires        : expiry for the unlock token.

ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_locked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS unlock_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS unlock_expires TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN users.failed_login_attempts IS 'Consecutive failed login attempts; reset on success or unlock';
COMMENT ON COLUMN users.account_locked_at IS 'When the account was locked due to failed logins; NULL if not locked';
COMMENT ON COLUMN users.unlock_token IS 'SHA-256 hash of the emailed account unlock token';
COMMENT ON COLUMN users.unlock_expires IS 'Expiry timestamp for the account unlock token';
