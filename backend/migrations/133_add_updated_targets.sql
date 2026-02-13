-- Migration: Add updated_targets field for trade management
-- Purpose: Store user-adjusted take profit targets that differ from original targets
-- These are used to calculate the Management R line showing the impact of target adjustments

-- Updated targets as JSONB array
-- Each target: { id, price, quantity, order }
-- This represents what the user adjusted their TPs to during/after the trade
ALTER TABLE trades ADD COLUMN IF NOT EXISTS updated_targets JSONB;

-- Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_trades_updated_targets ON trades USING GIN (updated_targets);
