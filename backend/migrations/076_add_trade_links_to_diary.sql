-- Add trade linking to diary entries
-- Allows journal entries to reference specific trades

-- Add linked_trades column to diary_entries
ALTER TABLE diary_entries ADD COLUMN IF NOT EXISTS linked_trades UUID[] DEFAULT '{}';

-- Create index for querying entries by linked trades
CREATE INDEX IF NOT EXISTS idx_diary_entries_linked_trades ON diary_entries USING GIN(linked_trades);

-- Add comment
COMMENT ON COLUMN diary_entries.linked_trades IS 'Array of trade IDs linked to this journal entry';
