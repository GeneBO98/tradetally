DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'api_keys'
      AND column_name = 'key_hmac'
  ) THEN
    ALTER TABLE api_keys ADD COLUMN key_hmac VARCHAR(64);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hmac
  ON api_keys (key_hmac)
  WHERE key_hmac IS NOT NULL;

COMMENT ON COLUMN api_keys.key_hmac IS 'HMAC-SHA256 lookup digest for constant-time API key lookup without O(N) bcrypt scans';
