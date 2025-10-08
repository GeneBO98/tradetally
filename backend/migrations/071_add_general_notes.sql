-- Migration 071: Add general notes table for pinned notes
-- This creates a table for general notes that aren't tied to a specific date

CREATE TABLE IF NOT EXISTS general_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255),
  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT fk_general_notes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_general_notes_user_id ON general_notes(user_id);
CREATE INDEX IF NOT EXISTS idx_general_notes_pinned ON general_notes(user_id, is_pinned);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_general_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER general_notes_updated_at
  BEFORE UPDATE ON general_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_general_notes_updated_at();

COMMENT ON TABLE general_notes IS 'General notes that are not tied to a specific date, displayed pinned on diary home page';
COMMENT ON COLUMN general_notes.is_pinned IS 'Whether the note is pinned to the top of the diary page';
