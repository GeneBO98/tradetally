-- Migration to fix entry_time and exit_time NOT NULL constraint issues
-- These columns should be nullable as they may not always be available during import

-- Make entry_time and exit_time nullable
ALTER TABLE trades ALTER COLUMN entry_time DROP NOT NULL;
ALTER TABLE trades ALTER COLUMN exit_time DROP NOT NULL;

-- Add indexes for better performance when these columns are used in queries
CREATE INDEX IF NOT EXISTS idx_trades_entry_time ON trades(entry_time) WHERE entry_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_exit_time ON trades(exit_time) WHERE exit_time IS NOT NULL;

-- Update any existing NULL values to use trade_date as fallback for queries that need timestamps
-- This is a one-time cleanup for existing data
UPDATE trades 
SET entry_time = trade_date::timestamp + interval '9 hours 30 minutes'  -- Market open time
WHERE entry_time IS NULL AND trade_date IS NOT NULL;

UPDATE trades 
SET exit_time = trade_date::timestamp + interval '16 hours'  -- Market close time  
WHERE exit_time IS NULL AND exit_date IS NOT NULL;

-- For trades without exit_date but with trade_date, assume same-day trade
UPDATE trades 
SET exit_time = trade_date::timestamp + interval '15 hours'  -- Afternoon close
WHERE exit_time IS NULL AND trade_date IS NOT NULL AND exit_date IS NULL;