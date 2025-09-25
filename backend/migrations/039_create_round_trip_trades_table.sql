-- Create round_trip_trades table to properly track round trips with UUIDs
CREATE TABLE IF NOT EXISTS round_trip_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    entry_time TIMESTAMP WITH TIME ZONE NOT NULL,
    exit_time TIMESTAMP WITH TIME ZONE,
    entry_price DECIMAL(15,6),
    exit_price DECIMAL(15,6),
    total_quantity DECIMAL(15,6) NOT NULL DEFAULT 0,
    total_pnl DECIMAL(15,2),
    total_commission DECIMAL(15,2) DEFAULT 0,
    total_fees DECIMAL(15,2) DEFAULT 0,
    pnl_percent DECIMAL(10,4),
    side VARCHAR(10) NOT NULL CHECK (side IN ('long', 'short')),
    strategy VARCHAR(50),
    notes TEXT,
    is_completed BOOLEAN DEFAULT false,
    trade_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for the round_trip_trades table
CREATE INDEX IF NOT EXISTS idx_round_trip_trades_user_id ON round_trip_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_round_trip_trades_symbol ON round_trip_trades(symbol);
CREATE INDEX IF NOT EXISTS idx_round_trip_trades_entry_time ON round_trip_trades(entry_time);
CREATE INDEX IF NOT EXISTS idx_round_trip_trades_completed ON round_trip_trades(is_completed);

-- Add round_trip_id column to trades table to link trades to round trips
ALTER TABLE trades ADD COLUMN IF NOT EXISTS round_trip_id UUID REFERENCES round_trip_trades(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_trades_round_trip_id ON trades(round_trip_id);

-- Create trigger to update round_trip_trades updated_at timestamp
CREATE OR REPLACE FUNCTION update_round_trip_trades_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_round_trip_trades_updated_at ON round_trip_trades;
CREATE TRIGGER update_round_trip_trades_updated_at
    BEFORE UPDATE ON round_trip_trades
    FOR EACH ROW
    EXECUTE FUNCTION update_round_trip_trades_updated_at();