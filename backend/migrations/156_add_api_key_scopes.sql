-- Add explicit OAuth-like scopes for API key authorization.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'api_keys'
          AND column_name = 'scopes'
    ) THEN
        ALTER TABLE api_keys ADD COLUMN scopes JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;

UPDATE api_keys
SET scopes = CASE
    WHEN permissions ? 'admin' THEN
        '["trades:read","analytics:read","watchlists:read","accounts:read","investments:read","alerts:read","trades:write","watchlists:write","alerts:write","admin:*"]'::jsonb
    WHEN permissions ? 'write' THEN
        '["trades:read","analytics:read","watchlists:read","accounts:read","investments:read","alerts:read","trades:write","watchlists:write","alerts:write"]'::jsonb
    WHEN permissions ? 'read' THEN
        '["trades:read","analytics:read","watchlists:read","accounts:read","investments:read","alerts:read"]'::jsonb
    ELSE
        '[]'::jsonb
END
WHERE scopes IS NULL OR scopes = '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_api_keys_scopes_gin
    ON api_keys USING GIN (scopes);
