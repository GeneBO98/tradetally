-- Create tick data table for storing historical price data around revenge trades
CREATE TABLE IF NOT EXISTS tick_data (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    timestamp BIGINT NOT NULL, -- Unix timestamp in seconds
    price DECIMAL(10,4) NOT NULL,
    volume INTEGER,
    conditions TEXT[], -- Array of trade conditions
    exchange VARCHAR(10), -- Exchange code
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint for efficient querying
    UNIQUE(symbol, timestamp)
);

-- Create tick data cache table for storing fetched tick data periods
CREATE TABLE IF NOT EXISTS tick_data_cache (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(10) NOT NULL,
    date DATE NOT NULL,
    start_timestamp BIGINT NOT NULL,
    end_timestamp BIGINT NOT NULL,
    tick_count INTEGER NOT NULL DEFAULT 0,
    fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    
    -- Unique constraint
    UNIQUE(symbol, date, start_timestamp, end_timestamp)
);

-- Create revenge trade tick analysis table to link revenge trades with their tick data
CREATE TABLE IF NOT EXISTS revenge_trade_tick_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revenge_trade_id UUID NOT NULL,
    trigger_trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    symbol VARCHAR(10) NOT NULL,
    trade_entry_time TIMESTAMP NOT NULL,
    trade_exit_time TIMESTAMP,
    analysis_window_minutes INTEGER NOT NULL DEFAULT 30,
    
    -- Tick data metrics
    pre_trade_ticks INTEGER DEFAULT 0,
    post_trade_ticks INTEGER DEFAULT 0,
    price_before_entry DECIMAL(10,4),
    price_at_entry DECIMAL(10,4),
    price_at_exit DECIMAL(10,4),
    price_after_exit DECIMAL(10,4),
    
    -- Analysis results
    price_trend_before VARCHAR(20), -- 'up', 'down', 'sideways'
    price_trend_after VARCHAR(20),
    volatility_before DECIMAL(8,4), -- Standard deviation of prices
    volatility_after DECIMAL(8,4),
    volume_before_avg INTEGER,
    volume_after_avg INTEGER,
    
    -- Behavioral indicators
    was_chasing_momentum BOOLEAN DEFAULT false,
    was_fighting_trend BOOLEAN DEFAULT false,
    entry_timing_score DECIMAL(3,2), -- 0-1 score for entry timing quality
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Unique constraint
    UNIQUE(user_id, revenge_trade_id)
);

-- Add trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tick_data_updated_at BEFORE UPDATE ON tick_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tick_data_cache_updated_at BEFORE UPDATE ON tick_data_cache FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_revenge_trade_tick_analysis_updated_at BEFORE UPDATE ON revenge_trade_tick_analysis FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_tick_symbol_date ON tick_data (symbol, date);
CREATE INDEX IF NOT EXISTS idx_tick_symbol_timestamp ON tick_data (symbol, timestamp);
CREATE INDEX IF NOT EXISTS idx_tick_created_at ON tick_data (created_at);

CREATE INDEX IF NOT EXISTS idx_cache_symbol_date ON tick_data_cache (symbol, date);
CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON tick_data_cache (expires_at);

CREATE INDEX IF NOT EXISTS idx_revenge_tick_user ON revenge_trade_tick_analysis (user_id);
CREATE INDEX IF NOT EXISTS idx_revenge_tick_symbol ON revenge_trade_tick_analysis (symbol);
CREATE INDEX IF NOT EXISTS idx_revenge_tick_created_at ON revenge_trade_tick_analysis (created_at);