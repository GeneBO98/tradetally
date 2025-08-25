-- Create table to track stock splits
CREATE TABLE IF NOT EXISTS stock_splits (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20) NOT NULL,
    split_date DATE NOT NULL,
    from_factor DECIMAL(10, 4) NOT NULL,
    to_factor DECIMAL(10, 4) NOT NULL,
    ratio DECIMAL(10, 4) NOT NULL, -- to_factor / from_factor (e.g., 2.0 for 2:1 split)
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, split_date)
);

-- Create index for efficient lookups
CREATE INDEX idx_stock_splits_symbol_date ON stock_splits(symbol, split_date DESC);
CREATE INDEX idx_stock_splits_processed ON stock_splits(processed) WHERE processed = FALSE;

-- Create table to track split adjustments applied to trades
CREATE TABLE IF NOT EXISTS trade_split_adjustments (
    id SERIAL PRIMARY KEY,
    trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
    split_id INTEGER NOT NULL REFERENCES stock_splits(id),
    original_quantity DECIMAL(15, 4) NOT NULL,
    adjusted_quantity DECIMAL(15, 4) NOT NULL,
    original_price DECIMAL(15, 4) NOT NULL,
    adjusted_price DECIMAL(15, 4) NOT NULL,
    adjustment_ratio DECIMAL(10, 4) NOT NULL,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(trade_id, split_id)
);

-- Create index for efficient lookups
CREATE INDEX idx_trade_split_adjustments_trade_id ON trade_split_adjustments(trade_id);

-- Add columns to trades table to track split adjustments
ALTER TABLE trades 
ADD COLUMN IF NOT EXISTS split_adjusted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS original_quantity DECIMAL(15, 4),
ADD COLUMN IF NOT EXISTS original_entry_price DECIMAL(15, 4),
ADD COLUMN IF NOT EXISTS original_exit_price DECIMAL(15, 4);

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_stock_splits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for stock_splits table
CREATE TRIGGER update_stock_splits_updated_at_trigger
BEFORE UPDATE ON stock_splits
FOR EACH ROW
EXECUTE FUNCTION update_stock_splits_updated_at();

-- Create table to track last check dates for each symbol
CREATE TABLE IF NOT EXISTS stock_split_check_log (
    id SERIAL PRIMARY KEY,
    symbol VARCHAR(20),
    last_checked_at TIMESTAMP NOT NULL,
    splits_found INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol)
);

CREATE INDEX idx_stock_split_check_log_last_checked ON stock_split_check_log(last_checked_at);