-- Migration: Add executions field to trades table
-- This allows storing detailed execution data for trade details view

ALTER TABLE trades ADD COLUMN IF NOT EXISTS executions JSONB;

-- Add index for executions queries if needed
-- CREATE INDEX IF NOT EXISTS idx_trades_executions ON trades USING GIN (executions);