-- Correct the APNs topic used by existing and future TradeTally iOS registrations.
-- Token environments are intentionally left unchanged; the iOS app refreshes
-- that value from its build configuration whenever APNs returns its token.

ALTER TABLE device_tokens
  ALTER COLUMN bundle_id SET DEFAULT 'com.tradetally.ios';

UPDATE device_tokens
SET bundle_id = 'com.tradetally.ios',
    updated_at = CURRENT_TIMESTAMP
WHERE platform = 'ios'
  AND bundle_id IS DISTINCT FROM 'com.tradetally.ios';
