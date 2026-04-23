ALTER TABLE webhook_subscriptions
ADD COLUMN IF NOT EXISTS provider_type VARCHAR(20) NOT NULL DEFAULT 'custom';

ALTER TABLE webhook_subscriptions
DROP CONSTRAINT IF EXISTS webhook_subscriptions_provider_type_check;

ALTER TABLE webhook_subscriptions
ADD CONSTRAINT webhook_subscriptions_provider_type_check
CHECK (provider_type IN ('custom', 'slack', 'discord'));

COMMENT ON COLUMN webhook_subscriptions.provider_type IS
'Webhook destination type: custom (standard JSON), slack, or discord.';
