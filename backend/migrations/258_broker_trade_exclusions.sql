CREATE TABLE broker_trade_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_trade_id UUID NOT NULL,
  broker_type TEXT NOT NULL,
  account_identifier TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  entry_time TIMESTAMPTZ,
  entry_price NUMERIC,
  quantity NUMERIC,
  executions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX broker_trade_exclusions_user_broker_idx
  ON broker_trade_exclusions (user_id, broker_type);
CREATE UNIQUE INDEX broker_trade_exclusions_source_trade_idx
  ON broker_trade_exclusions (user_id, source_trade_id);
