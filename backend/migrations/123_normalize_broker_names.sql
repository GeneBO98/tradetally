-- Migration: Normalize broker names to fix common misspellings
-- This fixes 'tradeovate' -> 'tradovate' in broker_fee_settings and trades tables

-- Fix broker_fee_settings table
UPDATE broker_fee_settings
SET broker = 'tradovate'
WHERE LOWER(broker) = 'tradeovate';

-- Fix trades table (broker column)
UPDATE trades
SET broker = 'tradovate'
WHERE LOWER(broker) = 'tradeovate';

-- Add a comment for documentation
COMMENT ON TABLE broker_fee_settings IS 'Stores per-broker commission and fee settings. Broker names should use canonical spelling (e.g., tradovate not tradeovate).';
