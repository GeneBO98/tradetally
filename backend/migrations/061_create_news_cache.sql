-- News cache table to store shared news data by symbol and date
-- This prevents duplicate API calls for the same symbol/date combination

CREATE TABLE IF NOT EXISTS news_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    symbol VARCHAR(20) NOT NULL,
    news_date DATE NOT NULL,
    news_events JSONB NOT NULL DEFAULT '[]',
    sentiment VARCHAR(20),
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Ensure only one cache entry per symbol/date
    UNIQUE(symbol, news_date)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_news_cache_symbol_date ON news_cache(symbol, news_date);
CREATE INDEX IF NOT EXISTS idx_news_cache_checked_at ON news_cache(checked_at);

-- Function to get or create news cache entry
CREATE OR REPLACE FUNCTION get_or_create_news_cache(
    p_symbol VARCHAR(20),
    p_news_date DATE,
    p_news_events JSONB DEFAULT '[]',
    p_sentiment VARCHAR(20) DEFAULT NULL
) RETURNS TABLE(
    cache_id UUID,
    news_events JSONB,
    sentiment VARCHAR(20),
    was_cached BOOLEAN
) AS $$
DECLARE
    existing_record news_cache%ROWTYPE;
    new_record news_cache%ROWTYPE;
BEGIN
    -- Try to find existing cache entry
    SELECT * INTO existing_record 
    FROM news_cache 
    WHERE symbol = p_symbol AND news_date = p_news_date;
    
    IF FOUND THEN
        -- Return existing cached data
        RETURN QUERY SELECT 
            existing_record.id,
            existing_record.news_events,
            existing_record.sentiment,
            TRUE as was_cached;
    ELSE
        -- Create new cache entry
        INSERT INTO news_cache (symbol, news_date, news_events, sentiment)
        VALUES (p_symbol, p_news_date, p_news_events, p_sentiment)
        RETURNING * INTO new_record;
        
        -- Return new data
        RETURN QUERY SELECT 
            new_record.id,
            new_record.news_events,
            new_record.sentiment,
            FALSE as was_cached;
    END IF;
END;
$$ LANGUAGE plpgsql;