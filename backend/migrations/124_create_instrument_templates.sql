-- Create instrument_templates table for saving reusable futures/options contract details
CREATE TABLE IF NOT EXISTS instrument_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  instrument_type VARCHAR(20) NOT NULL CHECK (instrument_type IN ('future', 'option')),

  -- Common fields
  symbol VARCHAR(20),

  -- Options fields
  underlying_symbol VARCHAR(20),
  option_type VARCHAR(10),
  contract_size INTEGER,

  -- Futures fields
  underlying_asset VARCHAR(100),
  tick_size DECIMAL(15, 6),
  point_value DECIMAL(15, 4),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for efficient lookup by user
CREATE INDEX idx_instrument_templates_user ON instrument_templates(user_id);

-- Index for user + instrument type queries
CREATE INDEX idx_instrument_templates_user_type ON instrument_templates(user_id, instrument_type);
