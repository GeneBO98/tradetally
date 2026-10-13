-- A physical device may only deliver pushes for one account at a time.
-- Registration previously upserted on (user_id, device_token) without
-- deactivating other accounts' rows, so a phone signed into several accounts
-- received every account's pushes.

-- Keep only the most recently registered active row per token.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY device_token
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id
         ) AS rn
  FROM device_tokens
  WHERE active = true
)
UPDATE device_tokens dt
SET active = false,
    updated_at = CURRENT_TIMESTAMP
FROM ranked r
WHERE dt.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_device_tokens_one_active_per_token
  ON device_tokens (device_token)
  WHERE active = true;
