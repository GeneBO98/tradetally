-- Migration: Create historical_prices table for persistent price caching
-- This table stores all fetched OHLCV data so API calls only happen once per symbol/date

CREATE TABLE IF NOT EXISTS historical_prices (
    symbol VARCHAR(20) NOT NULL,
    price_date DATE NOT NULL,
    open DECIMAL(15, 4),
    high DECIMAL(15, 4),
    low DECIMAL(15, 4),
    close DECIMAL(15, 4),
    volume BIGINT,
    data_source VARCHAR(50) DEFAULT 'unknown',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (symbol, price_date)
);

-- Index for lookups by symbol (range queries on price_date use the PK)
CREATE INDEX IF NOT EXISTS idx_historical_prices_symbol ON historical_prices (symbol);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_historical_prices_date ON historical_prices (price_date);
