-- Add news-related columns to trades table
-- This migration adds columns to track news events that occurred on trade dates

ALTER TABLE trades ADD COLUMN IF NOT EXISTS news_events JSONB DEFAULT '[]'::jsonb;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS has_news BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS news_sentiment VARCHAR(20);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS news_checked_at TIMESTAMP WITH TIME ZONE;

-- Add index for news-related queries
CREATE INDEX IF NOT EXISTS idx_trades_has_news ON trades(has_news) WHERE has_news = TRUE;
CREATE INDEX IF NOT EXISTS idx_trades_news_sentiment ON trades(news_sentiment) WHERE news_sentiment IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_news_events ON trades USING GIN(news_events) WHERE jsonb_array_length(news_events) > 0;

-- Add comment to explain the structure
COMMENT ON COLUMN trades.news_events IS 'JSONB array of news articles from trade date containing: headline, summary, url, datetime, sentiment, source';
COMMENT ON COLUMN trades.has_news IS 'Boolean flag indicating if any news events were found for this symbol on the trade date';
COMMENT ON COLUMN trades.news_sentiment IS 'Overall sentiment of news events: positive, negative, neutral, or mixed';
COMMENT ON COLUMN trades.news_checked_at IS 'Timestamp when news was last checked for this trade';