-- Add nonce column to oauth_authorization_codes table for OIDC support
ALTER TABLE oauth_authorization_codes ADD COLUMN IF NOT EXISTS nonce VARCHAR(255);

-- Add index for nonce lookups
CREATE INDEX IF NOT EXISTS idx_oauth_codes_nonce ON oauth_authorization_codes(nonce);
