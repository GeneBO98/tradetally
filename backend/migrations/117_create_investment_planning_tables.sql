-- Investment Planning Feature Tables
-- Supports 8 Pillars stock analysis, portfolio holdings tracking, and investment screener

-- Cached financial statements from Finnhub API
CREATE TABLE IF NOT EXISTS stock_financials_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(20) NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_period VARCHAR(10) NOT NULL, -- 'annual', 'Q1', 'Q2', 'Q3', 'Q4'

  -- Income Statement
  revenue DECIMAL(20,2),
  net_income DECIMAL(20,2),
  operating_income DECIMAL(20,2),
  gross_profit DECIMAL(20,2),
  ebit DECIMAL(20,2),
  ebitda DECIMAL(20,2),

  -- Balance Sheet
  total_assets DECIMAL(20,2),
  total_liabilities DECIMAL(20,2),
  total_equity DECIMAL(20,2),
  long_term_debt DECIMAL(20,2),
  short_term_debt DECIMAL(20,2),
  total_debt DECIMAL(20,2),
  cash_and_equivalents DECIMAL(20,2),

  -- Cash Flow
  free_cash_flow DECIMAL(20,2),
  operating_cash_flow DECIMAL(20,2),
  capital_expenditures DECIMAL(20,2),
  dividends_paid DECIMAL(20,2),

  -- Shares
  shares_outstanding BIGINT,
  shares_basic BIGINT,
  shares_diluted BIGINT,

  -- Metadata
  filing_date DATE,
  currency VARCHAR(10) DEFAULT 'USD',
  data_source VARCHAR(20) DEFAULT 'finnhub',
  raw_data JSONB,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT stock_financials_symbol_period_unique UNIQUE(symbol, fiscal_year, fiscal_period)
);

CREATE INDEX IF NOT EXISTS idx_stock_financials_symbol ON stock_financials_cache(symbol);
CREATE INDEX IF NOT EXISTS idx_stock_financials_fetched ON stock_financials_cache(fetched_at);
CREATE INDEX IF NOT EXISTS idx_stock_financials_year ON stock_financials_cache(fiscal_year DESC);

-- Cached 8 Pillars analysis results
CREATE TABLE IF NOT EXISTS eight_pillars_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol VARCHAR(20) NOT NULL,
  analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Market Data at time of analysis
  market_cap DECIMAL(20,2),
  current_price DECIMAL(15,4),
  shares_outstanding BIGINT,

  -- Pillar 1: 5-Year PE Ratio (Market Cap / Total 5-Year Earnings)
  pillar1_value DECIMAL(10,2),
  pillar1_threshold DECIMAL(10,2) DEFAULT 22.5,
  pillar1_passed BOOLEAN,
  pillar1_data JSONB,

  -- Pillar 2: 5-Year ROIC (5-Year FCF / (Equity + Debt))
  pillar2_value DECIMAL(10,4),
  pillar2_passed BOOLEAN,
  pillar2_data JSONB,

  -- Pillar 3: Shares Outstanding Trend
  pillar3_current_shares BIGINT,
  pillar3_prior_shares BIGINT,
  pillar3_change_percent DECIMAL(10,4),
  pillar3_passed BOOLEAN, -- True if decreasing or stable
  pillar3_data JSONB,

  -- Pillar 4: Cash Flow Growth (TTM FCF > FCF 5 years ago)
  pillar4_fcf_current DECIMAL(20,2),
  pillar4_fcf_prior DECIMAL(20,2),
  pillar4_passed BOOLEAN,
  pillar4_data JSONB,

  -- Pillar 5: Net Income Growth (TTM Net Income > 5 years ago)
  pillar5_income_current DECIMAL(20,2),
  pillar5_income_prior DECIMAL(20,2),
  pillar5_passed BOOLEAN,
  pillar5_data JSONB,

  -- Pillar 6: Revenue Growth (5-year expansion)
  pillar6_revenue_current DECIMAL(20,2),
  pillar6_revenue_prior DECIMAL(20,2),
  pillar6_growth_percent DECIMAL(10,4),
  pillar6_passed BOOLEAN,
  pillar6_data JSONB,

  -- Pillar 7: Long-Term Liabilities vs FCF (LT Debt / Avg 5-Year FCF)
  pillar7_lt_liabilities DECIMAL(20,2),
  pillar7_avg_fcf DECIMAL(20,2),
  pillar7_ratio DECIMAL(10,2),
  pillar7_threshold DECIMAL(10,2) DEFAULT 5.0,
  pillar7_passed BOOLEAN,
  pillar7_data JSONB,

  -- Pillar 8: 5-Year Price-to-FCF (Market Cap / Total 5-Year FCF)
  pillar8_value DECIMAL(10,2),
  pillar8_threshold DECIMAL(10,2) DEFAULT 22.5,
  pillar8_passed BOOLEAN,
  pillar8_data JSONB,

  -- Summary
  pillars_passed INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_eight_pillars_symbol ON eight_pillars_analysis(symbol);
CREATE INDEX IF NOT EXISTS idx_eight_pillars_date ON eight_pillars_analysis(analysis_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_eight_pillars_symbol_date_unique ON eight_pillars_analysis(symbol, (analysis_date::date));

-- User investment holdings (long-term positions)
CREATE TABLE IF NOT EXISTS investment_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,

  -- Position Info
  total_shares DECIMAL(15,6) NOT NULL DEFAULT 0,
  average_cost_basis DECIMAL(15,4),
  total_cost_basis DECIMAL(20,2),

  -- Current Value (updated via refresh)
  current_price DECIMAL(15,4),
  current_value DECIMAL(20,2),
  unrealized_pnl DECIMAL(20,2),
  unrealized_pnl_percent DECIMAL(10,4),
  price_updated_at TIMESTAMP,

  -- Dividend Tracking
  total_dividends_received DECIMAL(20,2) DEFAULT 0,
  dividend_yield_on_cost DECIMAL(10,4),
  last_dividend_date DATE,

  -- Portfolio Allocation
  target_allocation_percent DECIMAL(5,2),

  -- Metadata
  notes TEXT,
  sector VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT holdings_user_symbol_unique UNIQUE(user_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_holdings_user ON investment_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_holdings_symbol ON investment_holdings(symbol);

-- Individual purchase lots (for cost basis tracking)
CREATE TABLE IF NOT EXISTS investment_lots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES investment_holdings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Lot Details
  shares DECIMAL(15,6) NOT NULL,
  cost_per_share DECIMAL(15,4) NOT NULL,
  total_cost DECIMAL(20,2) NOT NULL,
  purchase_date DATE NOT NULL,

  -- Optional Fields
  broker VARCHAR(100),
  account_identifier VARCHAR(100),
  notes TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lots_holding ON investment_lots(holding_id);
CREATE INDEX IF NOT EXISTS idx_lots_user ON investment_lots(user_id);
CREATE INDEX IF NOT EXISTS idx_lots_date ON investment_lots(purchase_date DESC);

-- Dividend history
CREATE TABLE IF NOT EXISTS investment_dividends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES investment_holdings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,

  -- Dividend Details
  dividend_per_share DECIMAL(10,6) NOT NULL,
  shares_held DECIMAL(15,6) NOT NULL,
  total_amount DECIMAL(20,2) NOT NULL,
  ex_dividend_date DATE,
  payment_date DATE NOT NULL,

  -- Dividend Reinvestment (DRIP)
  is_drip BOOLEAN DEFAULT FALSE,
  drip_shares DECIMAL(15,6),
  drip_price DECIMAL(15,4),

  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dividends_holding ON investment_dividends(holding_id);
CREATE INDEX IF NOT EXISTS idx_dividends_user ON investment_dividends(user_id);
CREATE INDEX IF NOT EXISTS idx_dividends_date ON investment_dividends(payment_date DESC);

-- User screener search history
CREATE TABLE IF NOT EXISTS screener_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  company_name VARCHAR(255),
  searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_favorite BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_screener_user ON screener_searches(user_id);
CREATE INDEX IF NOT EXISTS idx_screener_symbol ON screener_searches(symbol);
CREATE INDEX IF NOT EXISTS idx_screener_searched ON screener_searches(searched_at DESC);

-- Add investment features to features table
INSERT INTO features (feature_key, feature_name, description, required_tier, is_active)
VALUES
  ('eight_pillars', '8 Pillars Stock Analysis', 'Value investing analysis using Paul Gabrail methodology', 'pro', TRUE),
  ('investment_screener', 'Investment Screener', 'Analyze any stock for long-term investment potential', 'pro', TRUE),
  ('portfolio_holdings', 'Portfolio Holdings Tracker', 'Track long-term investment positions with cost basis and dividends', 'pro', TRUE),
  ('fundamental_analysis', 'Fundamental Analysis', 'Access balance sheets, income statements, and cash flow data', 'pro', TRUE)
ON CONFLICT (feature_key) DO UPDATE SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description,
  required_tier = EXCLUDED.required_tier,
  is_active = EXCLUDED.is_active;
