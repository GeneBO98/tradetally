-- Migration: Track symbols that have no daily price candles from any provider
-- so the nightly price-history backfill can skip them instead of re-fetching
-- (and failing) every night. Options/futures/crypto/forex tickers that are
-- mislabeled as equities end up here.

CREATE TABLE IF NOT EXISTS price_unavailable_symbols (
    symbol VARCHAR(64) PRIMARY KEY,
    reason VARCHAR(64) NOT NULL DEFAULT 'no_candles',
    fail_count INTEGER NOT NULL DEFAULT 1,
    first_failed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_checked_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Used to find symbols still inside the re-check window.
CREATE INDEX IF NOT EXISTS idx_price_unavailable_last_checked
    ON price_unavailable_symbols (last_checked_at);
