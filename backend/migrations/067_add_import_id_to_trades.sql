-- Add import_id to trades table for reliable import deletion
-- Migration 067: Track which import each trade came from

ALTER TABLE trades ADD COLUMN IF NOT EXISTS import_id UUID;

-- Create index for faster lookups when deleting imports
CREATE INDEX IF NOT EXISTS idx_trades_import_id ON trades(import_id);

-- Add foreign key constraint to import_logs
ALTER TABLE trades
  ADD CONSTRAINT fk_trades_import_id
  FOREIGN KEY (import_id)
  REFERENCES import_logs(id)
  ON DELETE CASCADE;
