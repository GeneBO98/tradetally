-- Create global enrichment cache for news and market data
-- This prevents duplicate API calls for the same symbol/date combinations across users

CREATE TABLE IF NOT EXISTS global_enrichment_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    trade_date DATE NOT NULL,
    
    -- News data
    news_sentiment DECIMAL(3,2), -- -1.0 to 1.0
    news_count INTEGER DEFAULT 0,
    news_summary TEXT,
    major_news_events JSONB, -- Array of major news items
    
    -- Market data
    market_cap BIGINT,
    volume BIGINT,
    avg_volume BIGINT,
    volatility DECIMAL(5,4),
    sector VARCHAR(100),
    industry VARCHAR(100),
    
    -- Data source tracking
    data_sources JSONB DEFAULT '[]'::jsonb, -- Which APIs provided data
    confidence_score INTEGER DEFAULT 100, -- 0-100
    
    -- Cache metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE,
    access_count INTEGER DEFAULT 1,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT unique_symbol_date UNIQUE (symbol, trade_date)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_global_enrichment_cache_symbol_date ON global_enrichment_cache (symbol, trade_date);
CREATE INDEX IF NOT EXISTS idx_global_enrichment_cache_expires ON global_enrichment_cache (expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_global_enrichment_cache_created ON global_enrichment_cache (created_at);

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_global_enrichment_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM global_enrichment_cache 
    WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get or create cache entry
CREATE OR REPLACE FUNCTION get_or_create_global_enrichment_cache(
    p_symbol VARCHAR(20),
    p_trade_date DATE
)
RETURNS UUID AS $$
DECLARE
    cache_id UUID;
BEGIN
    -- Try to find existing cache entry
    SELECT id INTO cache_id
    FROM global_enrichment_cache
    WHERE symbol = p_symbol AND trade_date = p_trade_date;
    
    -- If not found, create new entry
    IF cache_id IS NULL THEN
        INSERT INTO global_enrichment_cache (symbol, trade_date)
        VALUES (p_symbol, p_trade_date)
        RETURNING id INTO cache_id;
    ELSE
        -- Update access tracking
        UPDATE global_enrichment_cache
        SET access_count = access_count + 1,
            last_accessed_at = CURRENT_TIMESTAMP
        WHERE id = cache_id;
    END IF;
    
    RETURN cache_id;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_global_enrichment_cache_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_global_enrichment_cache_updated_at ON global_enrichment_cache;
CREATE TRIGGER trigger_update_global_enrichment_cache_updated_at
    BEFORE UPDATE ON global_enrichment_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_global_enrichment_cache_updated_at();

-- Add comments for documentation
COMMENT ON TABLE global_enrichment_cache IS 'Global cache for trade enrichment data (news, market data) shared across all users';
COMMENT ON COLUMN global_enrichment_cache.symbol IS 'Stock ticker symbol';
COMMENT ON COLUMN global_enrichment_cache.trade_date IS 'Date of the trade';
COMMENT ON COLUMN global_enrichment_cache.news_sentiment IS 'Overall news sentiment score (-1.0 to 1.0)';
COMMENT ON COLUMN global_enrichment_cache.major_news_events IS 'Array of major news events with titles, sources, sentiment';
COMMENT ON COLUMN global_enrichment_cache.data_sources IS 'Array of API sources that provided data (finnhub, alpha_vantage, etc)';
COMMENT ON COLUMN global_enrichment_cache.expires_at IS 'When this cache entry expires (NULL = never expires)';
COMMENT ON COLUMN global_enrichment_cache.access_count IS 'How many times this cache entry has been accessed';