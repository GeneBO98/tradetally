CREATE SCHEMA IF NOT EXISTS journal_ext;

DROP VIEW IF EXISTS journal_ext.v_option_income;
DROP VIEW IF EXISTS journal_ext.v_parse_accuracy;
DROP VIEW IF EXISTS journal_ext.v_campaign_summary;

CREATE TABLE IF NOT EXISTS journal_ext.inbound_message (
  id UUID PRIMARY KEY,
  platform TEXT NOT NULL,
  provider_msg_id TEXT NOT NULL,
  channel_id TEXT,
  sender_id TEXT,
  raw_text TEXT NOT NULL,
  attachment_refs JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, provider_msg_id)
);

CREATE TABLE IF NOT EXISTS journal_ext.parse_attempt (
  id UUID PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES journal_ext.inbound_message(id) ON DELETE CASCADE,
  parser_version TEXT NOT NULL,
  intent_type TEXT,
  extracted_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(5, 4),
  validation_errors JSONB,
  disposition TEXT NOT NULL DEFAULT 'pending'
    CHECK (disposition IN ('pending', 'accepted', 'error', 'corrected', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_ext.campaign (
  id UUID PRIMARY KEY,
  name TEXT,
  campaign_type TEXT,
  symbol TEXT,
  thesis TEXT,
  meta JSONB,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  total_pnl NUMERIC(20, 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_ext.upstream_write (
  id UUID PRIMARY KEY,
  parse_id UUID NOT NULL REFERENCES journal_ext.parse_attempt(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES journal_ext.inbound_message(id) ON DELETE CASCADE,
  tradetally_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  action TEXT NOT NULL,
  request_body JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_status INTEGER,
  campaign_id UUID REFERENCES journal_ext.campaign(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_ext.campaign_event (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES journal_ext.campaign(id) ON DELETE CASCADE,
  upstream_write_id UUID REFERENCES journal_ext.upstream_write(id) ON DELETE SET NULL,
  tradetally_id TEXT,
  event_type TEXT NOT NULL,
  symbol TEXT,
  event_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS journal_ext.reconciliation_record (
  id UUID PRIMARY KEY,
  manual_write_id UUID NOT NULL REFERENCES journal_ext.upstream_write(id) ON DELETE CASCADE,
  broker_trade_id TEXT NOT NULL,
  match_method TEXT NOT NULL,
  match_score NUMERIC(6, 4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parse_attempt_message_created
  ON journal_ext.parse_attempt(message_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_upstream_write_parse_created
  ON journal_ext.upstream_write(parse_id, created_at);

CREATE INDEX IF NOT EXISTS idx_campaign_symbol_status_type
  ON journal_ext.campaign(symbol, status, campaign_type);

CREATE INDEX IF NOT EXISTS idx_campaign_event_campaign_time
  ON journal_ext.campaign_event(campaign_id, event_time);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reconciliation_record_broker_trade
  ON journal_ext.reconciliation_record(broker_trade_id);

CREATE OR REPLACE VIEW journal_ext.v_campaign_summary AS
SELECT
  c.id,
  c.name,
  c.campaign_type,
  c.symbol,
  c.status,
  c.opened_at,
  c.closed_at,
  COALESCE(c.total_pnl, 0) AS total_pnl,
  COUNT(ce.id)::integer AS trade_count,
  MAX(ce.event_time) AS last_event_at
FROM journal_ext.campaign c
LEFT JOIN journal_ext.campaign_event ce ON ce.campaign_id = c.id
GROUP BY c.id;

CREATE OR REPLACE VIEW journal_ext.v_parse_accuracy AS
SELECT
  parser_version,
  intent_type,
  disposition,
  COUNT(*)::integer AS attempts,
  ROUND(AVG(confidence)::numeric, 4) AS avg_confidence
FROM journal_ext.parse_attempt
GROUP BY parser_version, intent_type, disposition;

CREATE OR REPLACE VIEW journal_ext.v_option_income AS
SELECT
  c.id AS campaign_id,
  c.name,
  c.symbol,
  COUNT(uw.id)::integer AS write_count,
  COALESCE(c.total_pnl, 0) AS total_pnl
FROM journal_ext.campaign c
LEFT JOIN journal_ext.upstream_write uw ON uw.campaign_id = c.id
WHERE c.campaign_type IN ('wheel', 'covered_call', 'roll_chain')
GROUP BY c.id;
