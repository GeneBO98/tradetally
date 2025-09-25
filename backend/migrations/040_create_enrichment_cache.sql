-- Create enrichment cache table for persistent storage of trade enrichment data
-- This allows reuse of enrichment data even after trades are deleted

CREATE TABLE IF NOT EXISTS enrichment_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Core identification fields
    symbol VARCHAR(20) NOT NULL,
    entry_date DATE NOT NULL,
    entry_time TIME,
    cache_key VARCHAR(255) NOT NULL UNIQUE, -- Composite key: symbol_date_time
    
    -- Strategy classification data
    strategy VARCHAR(50),
    strategy_confidence INTEGER, -- 0-100
    classification_method VARCHAR(50),
    classification_signals JSONB,
    
    -- Market data at trade time
    entry_price DECIMAL(15,6),
    market_cap BIGINT,
    volume_24h BIGINT,
    sector VARCHAR(100),
    industry VARCHAR(100),
    
    -- Technical analysis data
    rsi_14 DECIMAL(5,2),
    sma_20 DECIMAL(15,6),
    sma_50 DECIMAL(15,6),
    bollinger_upper DECIMAL(15,6),
    bollinger_lower DECIMAL(15,6),
    
    -- Volatility and risk metrics
    implied_volatility DECIMAL(8,4),
    beta DECIMAL(8,4),
    
    -- News and sentiment data
    news_sentiment_score DECIMAL(5,2), -- -1.0 to 1.0
    news_count_24h INTEGER DEFAULT 0,
    earnings_proximity_days INTEGER, -- Days until/since earnings
    
    -- MAE/MFE estimation data (for similar timeframes)
    typical_mae_percent DECIMAL(8,4),
    typical_mfe_percent DECIMAL(8,4),
    mae_confidence INTEGER, -- 0-100
    
    -- Metadata
    data_source VARCHAR(50) DEFAULT 'background_job',
    api_provider VARCHAR(50), -- finnhub, alpha_vantage, etc.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 1,
    
    -- Expiry and validity
    expires_at TIMESTAMP WITH TIME ZONE, -- For time-sensitive data
    is_valid BOOLEAN DEFAULT true
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_enrichment_cache_symbol_date ON enrichment_cache(symbol, entry_date);
CREATE INDEX IF NOT EXISTS idx_enrichment_cache_cache_key ON enrichment_cache(cache_key);
CREATE INDEX IF NOT EXISTS idx_enrichment_cache_expires ON enrichment_cache(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_enrichment_cache_created ON enrichment_cache(created_at);

-- Function to generate cache key
CREATE OR REPLACE FUNCTION generate_enrichment_cache_key(
    p_symbol VARCHAR(20),
    p_entry_date DATE,
    p_entry_time TIME DEFAULT NULL
) RETURNS VARCHAR(255) AS $$
BEGIN
    IF p_entry_time IS NOT NULL THEN
        RETURN LOWER(p_symbol) || '_' || TO_CHAR(p_entry_date, 'YYYY-MM-DD') || '_' || TO_CHAR(p_entry_time, 'HH24:MI');
    ELSE
        RETURN LOWER(p_symbol) || '_' || TO_CHAR(p_entry_date, 'YYYY-MM-DD');
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to clean up expired cache entries
CREATE OR REPLACE FUNCTION cleanup_expired_enrichment_cache() RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM enrichment_cache 
    WHERE expires_at IS NOT NULL AND expires_at < CURRENT_TIMESTAMP;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_enrichment_cache_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if it exists, then create it
DROP TRIGGER IF EXISTS trigger_update_enrichment_cache_timestamp ON enrichment_cache;

CREATE TRIGGER trigger_update_enrichment_cache_timestamp
    BEFORE UPDATE ON enrichment_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_enrichment_cache_timestamp();

-- Add comment
COMMENT ON TABLE enrichment_cache IS 'Persistent cache for trade enrichment data that survives trade deletion';