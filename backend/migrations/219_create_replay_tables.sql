-- Trade Replay
-- Intraday (1-min) candle cache shared across all users: bars for closed
-- sessions are immutable market data, so each symbol/session is fetched from
-- the upstream provider once, ever. Coverage rows record which session windows
-- have already been fetched so known ranges (and known gaps) are never
-- re-requested. replay_usage meters the free tier's lifetime replay quota;
-- rewatching the same trade does not consume additional quota.

CREATE TABLE IF NOT EXISTS intraday_candles (
  symbol VARCHAR(32) NOT NULL,
  interval VARCHAR(8) NOT NULL DEFAULT '1min',
  ts BIGINT NOT NULL, -- bar open time, epoch seconds UTC
  open NUMERIC(20, 8) NOT NULL,
  high NUMERIC(20, 8) NOT NULL,
  low NUMERIC(20, 8) NOT NULL,
  close NUMERIC(20, 8) NOT NULL,
  volume BIGINT,
  source VARCHAR(32),
  PRIMARY KEY (symbol, interval, ts)
);

CREATE TABLE IF NOT EXISTS intraday_candle_coverage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(32) NOT NULL,
  interval VARCHAR(8) NOT NULL DEFAULT '1min',
  session_date DATE NOT NULL,
  from_ts BIGINT NOT NULL,
  to_ts BIGINT NOT NULL,
  source VARCHAR(32),
  candle_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (symbol, interval, session_date)
);

CREATE TABLE IF NOT EXISTS replay_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL,
  replayed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, trade_id)
);

CREATE INDEX IF NOT EXISTS idx_replay_usage_user ON replay_usage(user_id);

COMMENT ON TABLE intraday_candles IS 'Global cross-user cache of intraday OHLCV bars for trade replay. Bar times are epoch seconds UTC.';
COMMENT ON TABLE intraday_candle_coverage IS 'Records which symbol/session windows have been fetched so closed-session bars are requested from the provider at most once.';
COMMENT ON TABLE replay_usage IS 'Distinct trades each user has replayed; free tier is limited to a lifetime number of distinct trade replays.';
