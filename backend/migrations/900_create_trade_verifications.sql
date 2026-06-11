-- Verified trades (tradetally.io cloud-only feature)
-- A verification attests that a shared trade arrived via authenticated broker
-- sync and that its economic fields are unchanged since sync. The share card
-- links to a public verification page via public_code.
--
-- Numbered in the 900+ range: cloud-only migrations must not race the public
-- repo's sequential numbering (206 was taken by plaid_securities upstream).

CREATE TABLE IF NOT EXISTS trade_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  public_code VARCHAR(16) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'broker_verified',
  broker VARCHAR(50),
  -- SHA-256 over the trade's economic fields at verification time. The public
  -- page re-computes this from the live trade; a mismatch revokes.
  snapshot_hash VARCHAR(64) NOT NULL,
  -- Whether the owner opted to show dollar amounts on the public page.
  show_amounts BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_trade_verifications_user ON trade_verifications(user_id);

COMMENT ON TABLE trade_verifications IS 'Broker-verified trade attestations backing the share-card verification badge (cloud-only).';
