-- Create CUSIP mappings table to support both global and user-specific mappings
-- This separates CUSIP resolution from general symbol categorization

CREATE TABLE IF NOT EXISTS cusip_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cusip VARCHAR(9) NOT NULL,
  ticker VARCHAR(20) NOT NULL,
  company_name VARCHAR(255),
  resolution_source VARCHAR(20) NOT NULL, -- 'finnhub', 'ai', 'manual'
  user_id UUID REFERENCES users(id), -- NULL for global mappings, specific user_id for user overrides
  confidence_score INTEGER DEFAULT 100, -- 0-100, lower for AI resolutions
  verified BOOLEAN DEFAULT FALSE, -- TRUE when user confirms the mapping is correct
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID REFERENCES users(id), -- Who created this mapping
  
  -- Ensure uniqueness: one mapping per CUSIP per user context
  UNIQUE(cusip, user_id)
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_cusip_mappings_cusip ON cusip_mappings(cusip);
CREATE INDEX IF NOT EXISTS idx_cusip_mappings_ticker ON cusip_mappings(ticker);
CREATE INDEX IF NOT EXISTS idx_cusip_mappings_user_id ON cusip_mappings(user_id);
CREATE INDEX IF NOT EXISTS idx_cusip_mappings_source ON cusip_mappings(resolution_source);
CREATE INDEX IF NOT EXISTS idx_cusip_mappings_verified ON cusip_mappings(verified);

-- Index for lookup priority: user-specific first, then global
CREATE INDEX IF NOT EXISTS idx_cusip_mappings_lookup ON cusip_mappings(cusip, user_id NULLS LAST);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_cusip_mappings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_cusip_mappings_updated_at_trigger
BEFORE UPDATE ON cusip_mappings
FOR EACH ROW
EXECUTE FUNCTION update_cusip_mappings_updated_at();

-- Comments
COMMENT ON TABLE cusip_mappings IS 'CUSIP to ticker symbol mappings with support for global and user-specific overrides';
COMMENT ON COLUMN cusip_mappings.user_id IS 'NULL for global mappings from Finnhub, specific user_id for user overrides';
COMMENT ON COLUMN cusip_mappings.resolution_source IS 'Source of the mapping: finnhub (global), ai (user-specific), manual (user-specific)';
COMMENT ON COLUMN cusip_mappings.confidence_score IS 'Confidence in the mapping: 100 for Finnhub/manual, lower for AI';
COMMENT ON COLUMN cusip_mappings.verified IS 'Whether user has confirmed this mapping is correct';

-- Migrate existing data from symbol_categories where applicable
-- Only migrate entries that look like CUSIP -> ticker mappings
INSERT INTO cusip_mappings (cusip, ticker, company_name, resolution_source, user_id, confidence_score, verified)
SELECT 
  symbol as cusip,
  ticker,
  company_name,
  'finnhub' as resolution_source,
  NULL as user_id, -- Global mapping
  100 as confidence_score,
  TRUE as verified
FROM symbol_categories 
WHERE symbol ~ '^[A-Z0-9]{8}[0-9]$' -- CUSIP pattern
  AND ticker IS NOT NULL 
  AND symbol != ticker
ON CONFLICT (cusip, user_id) DO NOTHING;

-- Add a function to get the best CUSIP mapping for a user
CREATE OR REPLACE FUNCTION get_cusip_mapping(p_cusip VARCHAR(9), p_user_id UUID DEFAULT NULL)
RETURNS TABLE(
  cusip VARCHAR(9),
  ticker VARCHAR(20),
  company_name VARCHAR(255),
  resolution_source VARCHAR(20),
  confidence_score INTEGER,
  verified BOOLEAN,
  is_user_override BOOLEAN
) AS $$
BEGIN
  -- First try to find user-specific mapping
  IF p_user_id IS NOT NULL THEN
    RETURN QUERY
    SELECT 
      cm.cusip,
      cm.ticker,
      cm.company_name,
      cm.resolution_source,
      cm.confidence_score,
      cm.verified,
      TRUE as is_user_override
    FROM cusip_mappings cm
    WHERE cm.cusip = p_cusip 
      AND cm.user_id = p_user_id
    LIMIT 1;
    
    -- If user-specific mapping found, return it
    IF FOUND THEN
      RETURN;
    END IF;
  END IF;
  
  -- If no user-specific mapping, try global mapping
  RETURN QUERY
  SELECT 
    cm.cusip,
    cm.ticker,
    cm.company_name,
    cm.resolution_source,
    cm.confidence_score,
    cm.verified,
    FALSE as is_user_override
  FROM cusip_mappings cm
  WHERE cm.cusip = p_cusip 
    AND cm.user_id IS NULL
  ORDER BY cm.confidence_score DESC, cm.created_at ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;