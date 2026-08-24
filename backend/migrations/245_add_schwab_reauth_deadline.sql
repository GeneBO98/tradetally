-- Track Schwab's fixed seven-day OAuth authorization window so TradeTally can
-- ask the user to reconnect before syncing is interrupted.

ALTER TABLE broker_connections
ADD COLUMN IF NOT EXISTS schwab_refresh_token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS schwab_reauth_reminder_sent_at TIMESTAMP WITH TIME ZONE;

-- Existing refresh tokens do not expose their original issuance time, and the
-- connection's updated_at also changes during ordinary access-token refreshes.
-- Give every existing active Schwab connection one immediate proactive prompt;
-- completing it records the precise seven-day deadline for future reminders.
UPDATE broker_connections
SET schwab_refresh_token_expires_at = CURRENT_TIMESTAMP + INTERVAL '24 hours',
    schwab_reauth_reminder_sent_at = NULL
WHERE broker_type = 'schwab'
  AND connection_status = 'active'
  AND schwab_refresh_token IS NOT NULL
  AND schwab_refresh_token_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_broker_connections_schwab_reauth_due
    ON broker_connections (schwab_refresh_token_expires_at)
    WHERE broker_type = 'schwab'
      AND connection_status = 'active'
      AND schwab_reauth_reminder_sent_at IS NULL;

COMMENT ON COLUMN broker_connections.schwab_refresh_token_expires_at IS
    'Fixed Schwab refresh-token deadline established by the latest interactive OAuth authorization';
COMMENT ON COLUMN broker_connections.schwab_reauth_reminder_sent_at IS
    'When the pre-expiration reconnect reminder was claimed for the current Schwab authorization window';
