-- Backtest Sandbox (phase 2 of trade replay)
-- Users pick a symbol and a past session, play it forward bar-by-bar on the
-- shared intraday candle cache (migration 219), and place simulated orders.
-- backtest_sessions stores each saved run: the simulated fills plus summary
-- stats computed server-side on save. backtest_usage meters the free tier's
-- lifetime quota of distinct symbol/session loads; reloading a session the
-- user has already backtested never consumes additional quota.

CREATE TABLE IF NOT EXISTS backtest_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(32) NOT NULL,
  session_date DATE NOT NULL,
  fills JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_pnl NUMERIC(20, 4) NOT NULL DEFAULT 0,
  round_trips INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backtest_sessions_user
  ON backtest_sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS backtest_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(32) NOT NULL,
  session_date DATE NOT NULL,
  first_used_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, symbol, session_date)
);

CREATE INDEX IF NOT EXISTS idx_backtest_usage_user ON backtest_usage(user_id);

COMMENT ON TABLE backtest_sessions IS 'Saved backtest sandbox runs: simulated fills placed during bar-by-bar playback of a past session, with summary stats.';
COMMENT ON TABLE backtest_usage IS 'Distinct symbol/session combinations each user has backtested; free tier is limited to a lifetime number of distinct sessions.';
