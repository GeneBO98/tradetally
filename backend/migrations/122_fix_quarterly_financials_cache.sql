-- Fix quarterly financials cache to properly store multiple quarters per year
-- The previous design used fiscal_period='quarterly' for all quarters,
-- causing conflicts on the unique constraint (symbol, fiscal_year, fiscal_period)

-- Add fiscal_quarter column to distinguish Q1, Q2, Q3, Q4
ALTER TABLE stock_financials_cache
ADD COLUMN IF NOT EXISTS fiscal_quarter INTEGER;

-- Drop the old unique constraint
ALTER TABLE stock_financials_cache
DROP CONSTRAINT IF EXISTS stock_financials_symbol_period_unique;

-- Create new unique constraint that includes fiscal_quarter
-- For annual data, fiscal_quarter will be NULL
-- For quarterly data, fiscal_quarter will be 1, 2, 3, or 4
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_financials_unique
ON stock_financials_cache(symbol, fiscal_year, fiscal_period, COALESCE(fiscal_quarter, 0));

-- Clear old quarterly data since it's likely incomplete/incorrect
DELETE FROM stock_financials_cache WHERE fiscal_period = 'quarterly';

-- Add comment for clarity
COMMENT ON COLUMN stock_financials_cache.fiscal_quarter IS 'Quarter number (1-4) for quarterly data, NULL for annual data';
