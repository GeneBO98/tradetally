-- Add IBKR Contract ID (conid) for reliable options/futures matching across imports
-- This enables matching positions when importing multiple IBKR daily trade reports

-- Add conid column to trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS conid VARCHAR(20);

-- Create index for efficient lookups by conid
CREATE INDEX IF NOT EXISTS idx_trades_conid ON trades(conid);

-- Note: conid is populated from IBKR CSV imports (Activity Statement and Trade Confirmation formats)
-- It provides the most reliable way to match options across multiple import files
