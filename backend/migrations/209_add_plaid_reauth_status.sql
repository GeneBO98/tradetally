-- Add a reauth_required connection status (set by Plaid item webhooks when
-- the institution login expires) and track the last webhook received.
-- The partial index idx_plaid_connections_due_sync filters on
-- connection_status = 'active', so reauth_required connections automatically
-- drop out of scheduled syncs.

ALTER TABLE plaid_connections DROP CONSTRAINT IF EXISTS plaid_connections_connection_status_check;
ALTER TABLE plaid_connections ADD CONSTRAINT plaid_connections_connection_status_check
    CHECK (connection_status IN ('active', 'error', 'revoked', 'reauth_required'));

ALTER TABLE plaid_connections ADD COLUMN IF NOT EXISTS last_webhook_at TIMESTAMP WITH TIME ZONE;
