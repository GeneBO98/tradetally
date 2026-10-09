-- The iOS app has always sent `push_enabled` when creating and updating price
-- alerts, but the column never existed, so the toggle was silently discarded
-- and every triggered alert pushed regardless of the user's choice.
--
-- Defaults to TRUE so existing alerts keep their current (always-push) behavior.

ALTER TABLE price_alerts
ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT TRUE;

-- The original constraint predates push notifications and only accepted email
-- or browser. Push-only alerts - the natural choice on mobile - would have
-- violated it, so it has to learn about the third channel.
ALTER TABLE price_alerts
DROP CONSTRAINT IF EXISTS price_alerts_notification_check;

ALTER TABLE price_alerts
ADD CONSTRAINT price_alerts_notification_check
CHECK (email_enabled = TRUE OR browser_enabled = TRUE OR push_enabled = TRUE);

COMMENT ON COLUMN price_alerts.push_enabled IS 'Send an iOS/Android push notification when this alert triggers. Still gated by the user-level users.notify_price_alerts preference.';
