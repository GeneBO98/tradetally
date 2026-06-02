-- Correct webhook provider_type for rows that were defaulted to 'custom' but
-- point at a recognized Slack/Discord host. These endpoints only accept their
-- own payload formats, so a Discord URL saved as 'custom' silently fails with
-- HTTP 400. Only touch rows currently 'custom' so explicit choices are kept.

UPDATE webhook_subscriptions
SET provider_type = 'discord', updated_at = NOW()
WHERE provider_type = 'custom'
  AND url ~* '^https?://(canary\.|ptb\.)?discord(app)?\.com/';

UPDATE webhook_subscriptions
SET provider_type = 'slack', updated_at = NOW()
WHERE provider_type = 'custom'
  AND url ~* '^https?://hooks\.slack\.com/';
