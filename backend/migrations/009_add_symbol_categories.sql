-- Migration to add permanent symbol categorization storage
-- This table stores symbol industry/sector information permanently since it rarely changes

CREATE TABLE IF NOT EXISTS symbol_categories (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(20) NOT NULL UNIQUE,
  company_name VARCHAR(255),
  finnhub_industry VARCHAR(255),
  gics_sector VARCHAR(255),
  gics_group VARCHAR(255),
  gics_industry VARCHAR(255),
  gics_sub_industry VARCHAR(255),
  country VARCHAR(100),
  currency VARCHAR(10),
  exchange VARCHAR(50),
  ipo_date DATE,
  market_cap BIGINT,
  phone VARCHAR(50),
  share_outstanding DECIMAL(20, 2),
  ticker VARCHAR(20),
  weburl VARCHAR(500),
  logo VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX idx_symbol_categories_symbol ON symbol_categories(symbol);
CREATE INDEX idx_symbol_categories_industry ON symbol_categories(finnhub_industry);

-- Add trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_symbol_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_symbol_categories_updated_at_trigger
BEFORE UPDATE ON symbol_categories
FOR EACH ROW
EXECUTE FUNCTION update_symbol_categories_updated_at();

-- Insert a comment explaining the purpose
COMMENT ON TABLE symbol_categories IS 'Permanent storage for symbol categorization data to avoid repeated API calls';