-- Migration: Server-side OAuth state tracking for broker OAuth flows.
--
-- The previous Schwab OAuth implementation base64-encoded {userId, nonce} into
-- the OAuth state parameter without persisting anything server-side. That made
-- the state forgeable: any client could mint a state claiming to represent any
-- user and drive the callback into linking broker tokens against another
-- user's account. This table persists a random state token per init so the
-- callback can look up the real userId server-side instead of trusting the
-- client payload.

CREATE TABLE IF NOT EXISTS oauth_pending_states (
  state_token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(32) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_pending_states_expires_at
  ON oauth_pending_states (expires_at);

COMMENT ON TABLE oauth_pending_states
  IS 'Short-lived server-side OAuth state tokens. Keyed by a 256-bit random token sent as the OAuth state parameter; the callback looks up the row to recover the initiating userId rather than trusting the client-supplied state payload.';
