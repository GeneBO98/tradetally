-- Invalidate stateless access tokens after password changes and security-sensitive logout actions.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.session_version IS
  'Incremented to invalidate previously issued JWT access tokens for this user';

ALTER TABLE refresh_tokens
  ADD COLUMN IF NOT EXISTS session_version INTEGER;

UPDATE refresh_tokens rt
SET session_version = u.session_version
FROM users u
WHERE rt.user_id = u.id
  AND rt.session_version IS NULL;

ALTER TABLE refresh_tokens
  ALTER COLUMN session_version SET DEFAULT 0,
  ALTER COLUMN session_version SET NOT NULL;

COMMENT ON COLUMN refresh_tokens.session_version IS
  'User session version captured when the refresh token was issued';
