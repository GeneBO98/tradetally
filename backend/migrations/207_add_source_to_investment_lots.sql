-- Add source tracking to investment lots so Plaid-synced holdings can coexist
-- with manually entered lots. Plaid-managed lots use external_id
-- '<plaid_account_id>:<plaid_security_id>' (one synthetic lot per security per
-- Plaid account) and are updated in place on every holdings sync.

ALTER TABLE investment_lots
    ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual';

ALTER TABLE investment_lots
    ADD COLUMN IF NOT EXISTS external_id VARCHAR(255);

DO $$
BEGIN
    ALTER TABLE investment_lots
        ADD CONSTRAINT investment_lots_source_check
        CHECK (source IN ('manual', 'plaid'));
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_investment_lots_source_external
    ON investment_lots(source, external_id)
    WHERE external_id IS NOT NULL;
