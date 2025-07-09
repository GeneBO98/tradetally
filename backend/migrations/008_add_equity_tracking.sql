-- Add account_equity field to user_settings table
ALTER TABLE user_settings 
ADD COLUMN account_equity DECIMAL(15,2) DEFAULT 0.00;

-- Create equity_snapshots table to track equity changes over time
CREATE TABLE equity_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    equity_amount DECIMAL(15,2) NOT NULL,
    snapshot_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient querying by user and date
CREATE INDEX idx_equity_snapshots_user_date ON equity_snapshots(user_id, snapshot_date);

-- Create unique constraint to prevent duplicate entries for same user on same date
CREATE UNIQUE INDEX idx_equity_snapshots_user_date_unique ON equity_snapshots(user_id, snapshot_date);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_equity_snapshots_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER equity_snapshots_updated_at_trigger
    BEFORE UPDATE ON equity_snapshots
    FOR EACH ROW
    EXECUTE FUNCTION update_equity_snapshots_updated_at();