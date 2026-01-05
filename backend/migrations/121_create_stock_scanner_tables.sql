-- Stock Scanner Tables for Russell 2000 8 Pillars Analysis
-- Migration 121

-- Store scan metadata
CREATE TABLE IF NOT EXISTS stock_scans (
  id SERIAL PRIMARY KEY,
  scan_date DATE NOT NULL,
  total_stocks INTEGER DEFAULT 0,
  stocks_analyzed INTEGER DEFAULT 0,
  scan_duration_seconds INTEGER,
  status VARCHAR(20) DEFAULT 'pending', -- pending, running, completed, failed
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP
);

-- Store individual stock pillar results
CREATE TABLE IF NOT EXISTS stock_pillar_results (
  id SERIAL PRIMARY KEY,
  scan_id INTEGER REFERENCES stock_scans(id) ON DELETE CASCADE,
  symbol VARCHAR(20) NOT NULL,
  company_name VARCHAR(255),

  -- Individual pillar pass/fail (for filtering)
  pillar_1_pass BOOLEAN DEFAULT FALSE,
  pillar_2_pass BOOLEAN DEFAULT FALSE,
  pillar_3_pass BOOLEAN DEFAULT FALSE,
  pillar_4_pass BOOLEAN DEFAULT FALSE,
  pillar_5_pass BOOLEAN DEFAULT FALSE,
  pillar_6_pass BOOLEAN DEFAULT FALSE,
  pillar_7_pass BOOLEAN DEFAULT FALSE,
  pillar_8_pass BOOLEAN DEFAULT FALSE,

  -- Individual pillar scores (1-5 scale, null if data unavailable)
  pillar_1_score INTEGER,
  pillar_2_score INTEGER,
  pillar_3_score INTEGER,
  pillar_4_score INTEGER,
  pillar_5_score INTEGER,
  pillar_6_score INTEGER,
  pillar_7_score INTEGER,
  pillar_8_score INTEGER,

  -- Summary
  pillars_passed INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,

  -- Additional data for display
  current_price DECIMAL(15, 4),
  market_cap BIGINT,
  sector VARCHAR(100),

  created_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(scan_id, symbol)
);

-- Indexes for efficient filtering
CREATE INDEX IF NOT EXISTS idx_stock_pillar_results_scan_id ON stock_pillar_results(scan_id);
CREATE INDEX IF NOT EXISTS idx_stock_pillar_results_pillars ON stock_pillar_results(
  pillar_1_pass, pillar_2_pass, pillar_3_pass, pillar_4_pass,
  pillar_5_pass, pillar_6_pass, pillar_7_pass, pillar_8_pass
);
CREATE INDEX IF NOT EXISTS idx_stock_pillar_results_passed ON stock_pillar_results(pillars_passed DESC);
CREATE INDEX IF NOT EXISTS idx_stock_scans_status ON stock_scans(status);
CREATE INDEX IF NOT EXISTS idx_stock_scans_date ON stock_scans(scan_date DESC);
