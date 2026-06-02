-- Ensure webhook_subscriptions.provider_type exists.
--
-- Migration 176_add_webhook_provider_type.sql can end up recorded as applied on
-- some databases (e.g. baselined/restored dev instances, and there are several
-- duplicate "176_*" migration filenames) without the ALTER having actually run,
-- leaving the column missing. That makes every webhook query 500 with
-- "column provider_type does not exist". This re-applies the change idempotently:
-- it's a no-op where the column already exists.

ALTER TABLE webhook_subscriptions
ADD COLUMN IF NOT EXISTS provider_type VARCHAR(20) NOT NULL DEFAULT 'custom';

ALTER TABLE webhook_subscriptions
DROP CONSTRAINT IF EXISTS webhook_subscriptions_provider_type_check;

ALTER TABLE webhook_subscriptions
ADD CONSTRAINT webhook_subscriptions_provider_type_check
CHECK (provider_type IN ('custom', 'slack', 'discord'));

COMMENT ON COLUMN webhook_subscriptions.provider_type IS
'Webhook destination type: custom (standard JSON), slack, or discord.';
