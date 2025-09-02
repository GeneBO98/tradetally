-- Add support for options and futures trading
-- Migration 056: Add options and futures instrument support

-- Add new columns to trades table for options and futures
ALTER TABLE trades ADD COLUMN IF NOT EXISTS instrument_type VARCHAR(20) DEFAULT 'stock' CHECK (instrument_type IN ('stock', 'option', 'future'));

-- Options-specific fields
ALTER TABLE trades ADD COLUMN IF NOT EXISTS strike_price DECIMAL(10,4);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS option_type VARCHAR(4) CHECK (option_type IN ('call', 'put'));
ALTER TABLE trades ADD COLUMN IF NOT EXISTS contract_size INTEGER DEFAULT 100;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS underlying_symbol VARCHAR(10);

-- Futures-specific fields
ALTER TABLE trades ADD COLUMN IF NOT EXISTS contract_month VARCHAR(3);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS contract_year INTEGER;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS tick_size DECIMAL(10,6);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS point_value DECIMAL(10,2);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS underlying_asset VARCHAR(50);

-- Add indexes for new fields
CREATE INDEX IF NOT EXISTS idx_trades_instrument_type ON trades(instrument_type);
CREATE INDEX IF NOT EXISTS idx_trades_underlying_symbol ON trades(underlying_symbol);
CREATE INDEX IF NOT EXISTS idx_trades_expiration_date ON trades(expiration_date);
CREATE INDEX IF NOT EXISTS idx_trades_strike_price ON trades(strike_price);

-- Update existing trades to have instrument_type = 'stock'
UPDATE trades SET instrument_type = 'stock' WHERE instrument_type IS NULL;

-- Add check constraints for instrument-specific fields
ALTER TABLE trades ADD CONSTRAINT check_options_fields 
  CHECK (
    (instrument_type != 'option') OR 
    (strike_price IS NOT NULL AND expiration_date IS NOT NULL AND option_type IS NOT NULL AND underlying_symbol IS NOT NULL)
  );

ALTER TABLE trades ADD CONSTRAINT check_futures_fields 
  CHECK (
    (instrument_type != 'future') OR 
    (contract_month IS NOT NULL AND contract_year IS NOT NULL AND underlying_asset IS NOT NULL)
  );