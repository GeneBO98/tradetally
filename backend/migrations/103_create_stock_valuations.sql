-- DCF Stock Valuations - User-saved valuations with custom assumptions
-- EverythingMoney-style valuation calculator
CREATE TABLE IF NOT EXISTS stock_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  valuation_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  current_price DECIMAL(15,4),
  shares_outstanding BIGINT,

  -- Historical Metrics (auto-populated from Finnhub)
  roic_1yr DECIMAL(10,4),
  roic_5yr DECIMAL(10,4),
  roic_10yr DECIMAL(10,4),
  revenue_growth_1yr DECIMAL(10,4),
  revenue_growth_5yr DECIMAL(10,4),
  revenue_growth_10yr DECIMAL(10,4),
  profit_margin_1yr DECIMAL(10,4),
  profit_margin_5yr DECIMAL(10,4),
  profit_margin_10yr DECIMAL(10,4),
  fcf_margin_1yr DECIMAL(10,4),
  fcf_margin_5yr DECIMAL(10,4),
  fcf_margin_10yr DECIMAL(10,4),
  pe_ratio DECIMAL(10,2),
  price_to_fcf DECIMAL(10,2),
  current_fcf DECIMAL(20,2),
  current_revenue DECIMAL(20,2),
  current_net_income DECIMAL(20,2),

  -- User Inputs - Revenue Growth (Low/Medium/High)
  revenue_growth_low DECIMAL(10,4),
  revenue_growth_medium DECIMAL(10,4),
  revenue_growth_high DECIMAL(10,4),

  -- User Inputs - Profit Margin (Low/Medium/High)
  profit_margin_low DECIMAL(10,4),
  profit_margin_medium DECIMAL(10,4),
  profit_margin_high DECIMAL(10,4),

  -- User Inputs - FCF Margin (Low/Medium/High)
  fcf_margin_low DECIMAL(10,4),
  fcf_margin_medium DECIMAL(10,4),
  fcf_margin_high DECIMAL(10,4),

  -- User Inputs - P/E Multiple (Low/Medium/High)
  pe_low DECIMAL(10,2),
  pe_medium DECIMAL(10,2),
  pe_high DECIMAL(10,2),

  -- User Inputs - P/FCF Multiple (Low/Medium/High)
  pfcf_low DECIMAL(10,2),
  pfcf_medium DECIMAL(10,2),
  pfcf_high DECIMAL(10,2),

  -- User Inputs - Desired Annual Return (Low/Medium/High)
  -- Note: Low scenario typically uses HIGHER return (more conservative)
  desired_return_low DECIMAL(10,4) DEFAULT 0.15,
  desired_return_medium DECIMAL(10,4) DEFAULT 0.12,
  desired_return_high DECIMAL(10,4) DEFAULT 0.10,

  -- DCF Parameters (legacy - kept for backward compatibility)
  desired_annual_return DECIMAL(10,4) DEFAULT 0.15,
  projection_years INTEGER DEFAULT 10,
  terminal_growth_rate DECIMAL(10,4) DEFAULT 0.03,

  -- Calculated Results
  fair_value_low DECIMAL(15,4),
  fair_value_medium DECIMAL(15,4),
  fair_value_high DECIMAL(15,4),

  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_valuations_user_symbol ON stock_valuations(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_valuations_user ON stock_valuations(user_id);
CREATE INDEX IF NOT EXISTS idx_valuations_date ON stock_valuations(valuation_date DESC);

-- Add new columns if they don't exist (for existing installations)
DO $$
BEGIN
  -- Add current_revenue if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'current_revenue') THEN
    ALTER TABLE stock_valuations ADD COLUMN current_revenue DECIMAL(20,2);
  END IF;

  -- Add current_net_income if not exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'current_net_income') THEN
    ALTER TABLE stock_valuations ADD COLUMN current_net_income DECIMAL(20,2);
  END IF;

  -- Add profit_margin columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'profit_margin_low') THEN
    ALTER TABLE stock_valuations ADD COLUMN profit_margin_low DECIMAL(10,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'profit_margin_medium') THEN
    ALTER TABLE stock_valuations ADD COLUMN profit_margin_medium DECIMAL(10,4);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'profit_margin_high') THEN
    ALTER TABLE stock_valuations ADD COLUMN profit_margin_high DECIMAL(10,4);
  END IF;

  -- Add P/E columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'pe_low') THEN
    ALTER TABLE stock_valuations ADD COLUMN pe_low DECIMAL(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'pe_medium') THEN
    ALTER TABLE stock_valuations ADD COLUMN pe_medium DECIMAL(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'pe_high') THEN
    ALTER TABLE stock_valuations ADD COLUMN pe_high DECIMAL(10,2);
  END IF;

  -- Add P/FCF columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'pfcf_low') THEN
    ALTER TABLE stock_valuations ADD COLUMN pfcf_low DECIMAL(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'pfcf_medium') THEN
    ALTER TABLE stock_valuations ADD COLUMN pfcf_medium DECIMAL(10,2);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'pfcf_high') THEN
    ALTER TABLE stock_valuations ADD COLUMN pfcf_high DECIMAL(10,2);
  END IF;

  -- Add desired_return columns
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'desired_return_low') THEN
    ALTER TABLE stock_valuations ADD COLUMN desired_return_low DECIMAL(10,4) DEFAULT 0.15;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'desired_return_medium') THEN
    ALTER TABLE stock_valuations ADD COLUMN desired_return_medium DECIMAL(10,4) DEFAULT 0.12;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'stock_valuations' AND column_name = 'desired_return_high') THEN
    ALTER TABLE stock_valuations ADD COLUMN desired_return_high DECIMAL(10,4) DEFAULT 0.10;
  END IF;
END $$;
