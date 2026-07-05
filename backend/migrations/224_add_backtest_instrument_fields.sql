-- Backtest sandbox: futures support (playback phase 3)
-- Sessions can now be futures runs. instrument_type records what was traded;
-- multiplier is the contract point value used for P&L (derived server-side
-- from the futures root at save time; 1 for stocks). Existing rows are all
-- stocks, so the defaults are correct and no backfill is needed.

ALTER TABLE backtest_sessions ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(16) NOT NULL DEFAULT 'stock';
ALTER TABLE backtest_sessions ADD COLUMN IF NOT EXISTS multiplier NUMERIC(14, 4) NOT NULL DEFAULT 1;

COMMENT ON COLUMN backtest_sessions.instrument_type IS 'What the session traded: stock or future.';
COMMENT ON COLUMN backtest_sessions.multiplier IS 'P&L multiplier applied per unit: futures point value, 1 for stocks. Derived server-side on save.';
