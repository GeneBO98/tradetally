-- Repair migration 249 without changing already-imported trades. Keep every
-- colliding legacy row in its own profile rather than silently discarding it.
DO $$
DECLARE
  legacy RECORD;
  profile_id UUID;
BEGIN
  FOR legacy IN
    WITH canonical AS (
      SELECT bfs.*,
        CASE
          WHEN LOWER(TRIM(broker)) IN ('tradeovate', 'trade ovate') THEN 'tradovate'
          WHEN LOWER(TRIM(broker)) IN ('sierra chart', 'sierra_chart', 'sierrachart') THEN 'sierrachart'
          WHEN LOWER(TRIM(broker)) IN ('interactive brokers', 'interactivebrokers') THEN 'ibkr'
          WHEN LOWER(TRIM(broker)) IN ('thinkorswim', 'tos') THEN 'thinkorswim'
          ELSE LOWER(TRIM(broker))
        END AS broker_id
      FROM broker_fee_settings bfs
      WHERE NULLIF(TRIM(broker), '') IS NOT NULL
    ), ranked AS (
      SELECT canonical.*, ROW_NUMBER() OVER (
        PARTITION BY user_id, broker_id, UPPER(COALESCE(instrument, ''))
        ORDER BY CASE WHEN LOWER(TRIM(broker)) = broker_id THEN 0 ELSE 1 END,
          updated_at DESC
      ) AS row_rank
      FROM canonical
    )
    SELECT * FROM ranked WHERE row_rank > 1
  LOOP
    INSERT INTO fee_profiles (user_id, name, notes)
    VALUES (legacy.user_id, 'Legacy ' || LEFT(legacy.broker, 48) || ' ' || legacy.id::text,
      'Preserved conflicting legacy fee schedule. Review before assigning to an account.')
    ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO profile_id;

    INSERT INTO fee_profile_rates (
      fee_profile_id, broker, instrument, commission_per_contract, commission_per_side,
      exchange_fee_per_contract, nfa_fee_per_contract, clearing_fee_per_contract,
      platform_fee_per_contract, notes
    ) VALUES (
      profile_id, legacy.broker_id, UPPER(COALESCE(legacy.instrument, '')),
      COALESCE(legacy.commission_per_contract, 0), COALESCE(legacy.commission_per_side, 0),
      COALESCE(legacy.exchange_fee_per_contract, 0), COALESCE(legacy.nfa_fee_per_contract, 0),
      COALESCE(legacy.clearing_fee_per_contract, 0), COALESCE(legacy.platform_fee_per_contract, 0),
      legacy.notes
    ) ON CONFLICT (fee_profile_id, broker, instrument) DO NOTHING;
  END LOOP;
END $$;

-- Migration 249's UPDATE FROM can match both the broker and Simulated profiles.
-- Resolve that ambiguity explicitly, including accounts it assigned incorrectly.
UPDATE user_accounts ua
SET fee_profile_id = fp.id
FROM fee_profiles fp
WHERE fp.user_id = ua.user_id AND fp.name = 'Simulated' AND fp.is_zero_fee
  AND LOWER(COALESCE(ua.account_name, '') || ' ' || COALESCE(ua.account_identifier, '') || ' ' || COALESCE(ua.broker, ''))
      ~ '(^|[^a-z])(sim[0-9]*|simulated)([^a-z]|$)'
  AND ua.fee_profile_id IS DISTINCT FROM fp.id;
