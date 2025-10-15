-- Add auto_closed flag to track trades that were automatically closed (e.g., expired options)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS auto_closed BOOLEAN DEFAULT FALSE;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS auto_close_reason VARCHAR(100);

-- Create index for querying expired options
CREATE INDEX IF NOT EXISTS idx_trades_expired_options
ON trades(instrument_type, expiration_date, exit_time)
WHERE instrument_type = 'option' AND exit_time IS NULL;

-- Add comment
COMMENT ON COLUMN trades.auto_closed IS 'Indicates if trade was automatically closed by system (e.g., expired options)';
COMMENT ON COLUMN trades.auto_close_reason IS 'Reason for auto-close (e.g., "option expired worthless")';
