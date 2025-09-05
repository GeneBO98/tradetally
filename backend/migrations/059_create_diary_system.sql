-- Create diary system for trading journal and playbook functionality
-- This migration adds tables for diary entries and attachments

-- Create diary_entries table
CREATE TABLE IF NOT EXISTS diary_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    title VARCHAR(255),
    content TEXT,
    tags TEXT[] DEFAULT '{}',
    entry_type VARCHAR(20) NOT NULL DEFAULT 'diary' CHECK (entry_type IN ('diary', 'playbook')),
    market_bias VARCHAR(20) CHECK (market_bias IN ('bullish', 'bearish', 'neutral')),
    key_levels TEXT,
    watchlist TEXT[] DEFAULT '{}',
    followed_plan BOOLEAN,
    lessons_learned TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Ensure one entry per user per date per type
    UNIQUE(user_id, entry_date, entry_type)
);

-- Create diary_attachments table
CREATE TABLE IF NOT EXISTS diary_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    diary_entry_id UUID NOT NULL REFERENCES diary_entries(id) ON DELETE CASCADE,
    file_url VARCHAR(500) NOT NULL,
    file_type VARCHAR(100),
    file_name VARCHAR(255),
    file_size INTEGER,
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_diary_entries_user_id ON diary_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_diary_entries_entry_date ON diary_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_diary_entries_user_date ON diary_entries(user_id, entry_date);
CREATE INDEX IF NOT EXISTS idx_diary_entries_entry_type ON diary_entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_diary_entries_tags ON diary_entries USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_diary_entries_market_bias ON diary_entries(market_bias) WHERE market_bias IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diary_attachments_diary_entry_id ON diary_attachments(diary_entry_id);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_diary_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at on diary_entries
DROP TRIGGER IF EXISTS update_diary_entries_updated_at ON diary_entries;
CREATE TRIGGER update_diary_entries_updated_at 
    BEFORE UPDATE ON diary_entries 
    FOR EACH ROW 
    EXECUTE FUNCTION update_diary_entries_updated_at();

-- Add comments for documentation
COMMENT ON TABLE diary_entries IS 'Trading journal and playbook entries for users';
COMMENT ON COLUMN diary_entries.entry_type IS 'Type of entry: diary for daily notes, playbook for trade setups';
COMMENT ON COLUMN diary_entries.market_bias IS 'Daily market sentiment: bullish, bearish, or neutral';
COMMENT ON COLUMN diary_entries.key_levels IS 'Important price levels for the trading day';
COMMENT ON COLUMN diary_entries.watchlist IS 'Array of symbols to watch for trading opportunities';
COMMENT ON COLUMN diary_entries.followed_plan IS 'Post-market reflection: whether the trader followed their plan';
COMMENT ON COLUMN diary_entries.lessons_learned IS 'Post-market notes and lessons learned';

COMMENT ON TABLE diary_attachments IS 'File attachments (screenshots, charts) for diary entries';