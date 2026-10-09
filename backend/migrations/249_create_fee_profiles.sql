-- Named fee profiles assigned to managed trading accounts (GitHub issue #406).
-- The legacy broker_fee_settings table remains available as a compatibility
-- fallback for users who have not assigned a profile.

CREATE TABLE IF NOT EXISTS fee_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    notes TEXT,
    is_zero_fee BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fee_profiles_user_name_unique UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS fee_profile_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fee_profile_id UUID NOT NULL REFERENCES fee_profiles(id) ON DELETE CASCADE,
    broker VARCHAR(100) NOT NULL,
    instrument VARCHAR(50) NOT NULL DEFAULT '',
    commission_per_contract DECIMAL(12,6) NOT NULL DEFAULT 0,
    commission_per_side DECIMAL(12,6) NOT NULL DEFAULT 0,
    exchange_fee_per_contract DECIMAL(12,6) NOT NULL DEFAULT 0,
    nfa_fee_per_contract DECIMAL(12,6) NOT NULL DEFAULT 0,
    clearing_fee_per_contract DECIMAL(12,6) NOT NULL DEFAULT 0,
    platform_fee_per_contract DECIMAL(12,6) NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fee_profile_rates_profile_broker_instrument_unique
      UNIQUE (fee_profile_id, broker, instrument)
);

ALTER TABLE user_accounts
ADD COLUMN IF NOT EXISTS fee_profile_id UUID REFERENCES fee_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fee_profiles_user_id
  ON fee_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_fee_profile_rates_profile_id
  ON fee_profile_rates(fee_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_accounts_fee_profile_id
  ON user_accounts(fee_profile_id);

DROP TRIGGER IF EXISTS update_fee_profiles_updated_at ON fee_profiles;
CREATE TRIGGER update_fee_profiles_updated_at
    BEFORE UPDATE ON fee_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_fee_profile_rates_updated_at ON fee_profile_rates;
CREATE TRIGGER update_fee_profile_rates_updated_at
    BEFORE UPDATE ON fee_profile_rates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE fee_profiles IS 'Named commission and fee schedules that can be shared by multiple managed accounts';
COMMENT ON TABLE fee_profile_rates IS 'Broker/instrument fee rows belonging to a named fee profile';
COMMENT ON COLUMN fee_profiles.is_zero_fee IS 'Explicitly marks simulated or paper profiles as zero-fee and prevents legacy fallback';
COMMENT ON COLUMN user_accounts.fee_profile_id IS 'Optional named fee profile used when importing trades for this account';

-- Migrate every legacy broker schedule into one named profile per user/broker.
-- Canonical broker IDs avoid duplicate profiles for historical aliases such as
-- tradeovate and Sierra Chart display-name variants.
WITH canonical_legacy AS (
  SELECT DISTINCT
    user_id,
    CASE
      WHEN LOWER(TRIM(broker)) IN ('tradeovate', 'trade ovate') THEN 'tradovate'
      WHEN LOWER(TRIM(broker)) IN ('sierra chart', 'sierra_chart', 'sierrachart') THEN 'sierrachart'
      WHEN LOWER(TRIM(broker)) IN ('interactive brokers', 'interactivebrokers') THEN 'ibkr'
      WHEN LOWER(TRIM(broker)) IN ('thinkorswim', 'tos') THEN 'thinkorswim'
      ELSE LOWER(TRIM(broker))
    END AS broker_id
  FROM broker_fee_settings
  WHERE NULLIF(TRIM(broker), '') IS NOT NULL
), profile_seed AS (
  SELECT
    user_id,
    broker_id,
    CASE broker_id
      WHEN 'tradovate' THEN 'Tradovate'
      WHEN 'sierrachart' THEN 'Sierra Chart'
      WHEN 'ibkr' THEN 'Interactive Brokers'
      WHEN 'thinkorswim' THEN 'ThinkorSwim'
      ELSE INITCAP(REPLACE(broker_id, '_', ' '))
    END AS profile_name
  FROM canonical_legacy
)
INSERT INTO fee_profiles (user_id, name)
SELECT user_id, profile_name
FROM profile_seed
WHERE profile_name <> ''
ON CONFLICT (user_id, name) DO NOTHING;

WITH canonical_legacy AS (
  SELECT
    bfs.*,
    CASE
      WHEN LOWER(TRIM(bfs.broker)) IN ('tradeovate', 'trade ovate') THEN 'tradovate'
      WHEN LOWER(TRIM(bfs.broker)) IN ('sierra chart', 'sierra_chart', 'sierrachart') THEN 'sierrachart'
      WHEN LOWER(TRIM(bfs.broker)) IN ('interactive brokers', 'interactivebrokers') THEN 'ibkr'
      WHEN LOWER(TRIM(bfs.broker)) IN ('thinkorswim', 'tos') THEN 'thinkorswim'
      ELSE LOWER(TRIM(bfs.broker))
    END AS broker_id,
    ROW_NUMBER() OVER (
      PARTITION BY bfs.user_id,
        CASE
          WHEN LOWER(TRIM(bfs.broker)) IN ('tradeovate', 'trade ovate') THEN 'tradovate'
          WHEN LOWER(TRIM(bfs.broker)) IN ('sierra chart', 'sierra_chart', 'sierrachart') THEN 'sierrachart'
          WHEN LOWER(TRIM(bfs.broker)) IN ('interactive brokers', 'interactivebrokers') THEN 'ibkr'
          WHEN LOWER(TRIM(bfs.broker)) IN ('thinkorswim', 'tos') THEN 'thinkorswim'
          ELSE LOWER(TRIM(bfs.broker))
        END,
        UPPER(COALESCE(bfs.instrument, ''))
      ORDER BY CASE WHEN LOWER(TRIM(bfs.broker)) = LOWER(
        CASE
          WHEN LOWER(TRIM(bfs.broker)) IN ('tradeovate', 'trade ovate') THEN 'tradovate'
          WHEN LOWER(TRIM(bfs.broker)) IN ('sierra chart', 'sierra_chart', 'sierrachart') THEN 'sierrachart'
          WHEN LOWER(TRIM(bfs.broker)) IN ('interactive brokers', 'interactivebrokers') THEN 'ibkr'
          WHEN LOWER(TRIM(bfs.broker)) IN ('thinkorswim', 'tos') THEN 'thinkorswim'
          ELSE LOWER(TRIM(bfs.broker))
        END
      ) THEN 0 ELSE 1 END, bfs.updated_at DESC
    ) AS row_rank
  FROM broker_fee_settings bfs
  WHERE NULLIF(TRIM(bfs.broker), '') IS NOT NULL
), profile_names AS (
  SELECT DISTINCT
    user_id,
    broker_id,
    CASE broker_id
      WHEN 'tradovate' THEN 'Tradovate'
      WHEN 'sierrachart' THEN 'Sierra Chart'
      WHEN 'ibkr' THEN 'Interactive Brokers'
      WHEN 'thinkorswim' THEN 'ThinkorSwim'
      ELSE INITCAP(REPLACE(broker_id, '_', ' '))
    END AS profile_name
  FROM canonical_legacy
)
INSERT INTO fee_profile_rates (
  fee_profile_id, broker, instrument,
  commission_per_contract, commission_per_side,
  exchange_fee_per_contract, nfa_fee_per_contract,
  clearing_fee_per_contract, platform_fee_per_contract, notes
)
SELECT
  fp.id,
  cl.broker_id,
  UPPER(COALESCE(cl.instrument, '')),
  COALESCE(cl.commission_per_contract, 0),
  COALESCE(cl.commission_per_side, 0),
  COALESCE(cl.exchange_fee_per_contract, 0),
  COALESCE(cl.nfa_fee_per_contract, 0),
  COALESCE(cl.clearing_fee_per_contract, 0),
  COALESCE(cl.platform_fee_per_contract, 0),
  cl.notes
FROM canonical_legacy cl
JOIN profile_names pn ON pn.user_id = cl.user_id AND pn.broker_id = cl.broker_id
JOIN fee_profiles fp ON fp.user_id = pn.user_id AND fp.name = pn.profile_name
WHERE cl.row_rank = 1
ON CONFLICT (fee_profile_id, broker, instrument) DO NOTHING;

-- Accounts that already identify their broker can keep using the migrated
-- profile immediately. Simulated accounts get an explicit zero-fee profile.
INSERT INTO fee_profiles (user_id, name, is_zero_fee)
SELECT DISTINCT ua.user_id, 'Simulated', TRUE
FROM user_accounts ua
WHERE LOWER(COALESCE(ua.account_name, '') || ' ' || COALESCE(ua.account_identifier, '') || ' ' || COALESCE(ua.broker, ''))
      ~ '(^|[^a-z])(sim[0-9]*|simulated)([^a-z]|$)'
ON CONFLICT (user_id, name) DO UPDATE SET is_zero_fee = TRUE;

UPDATE user_accounts ua
SET fee_profile_id = fp.id
FROM fee_profiles fp
WHERE ua.user_id = fp.user_id
  AND ua.fee_profile_id IS NULL
  AND (
    (
      fp.name = 'Simulated'
      AND LOWER(COALESCE(ua.account_name, '') || ' ' || COALESCE(ua.account_identifier, '') || ' ' || COALESCE(ua.broker, ''))
          ~ '(^|[^a-z])(sim[0-9]*|simulated)([^a-z]|$)'
    )
    OR (
      fp.name <> 'Simulated'
      AND LOWER(REGEXP_REPLACE(COALESCE(ua.broker, ''), '[ _-]', '', 'g')) =
          LOWER(REGEXP_REPLACE(fp.name, '[ _-]', '', 'g'))
    )
  );
