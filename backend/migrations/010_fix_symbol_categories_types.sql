-- Fix data types in symbol_categories table
-- Market cap and share outstanding can be decimal values

ALTER TABLE symbol_categories 
ALTER COLUMN market_cap TYPE DECIMAL(20, 2);

ALTER TABLE symbol_categories 
ALTER COLUMN share_outstanding TYPE DECIMAL(20, 2);

-- Add comment explaining the fix
COMMENT ON COLUMN symbol_categories.market_cap IS 'Market capitalization in millions, can have decimal values';
COMMENT ON COLUMN symbol_categories.share_outstanding IS 'Shares outstanding in millions, can have decimal values';