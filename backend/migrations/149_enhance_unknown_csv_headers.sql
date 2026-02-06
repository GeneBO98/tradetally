-- Enhance unknown_csv_headers table with additional tracking fields
-- for better diagnostics and import analysis

-- Add new columns for enhanced tracking
ALTER TABLE unknown_csv_headers
ADD COLUMN IF NOT EXISTS diagnostics_json JSONB,
ADD COLUMN IF NOT EXISTS detected_broker VARCHAR(50),
ADD COLUMN IF NOT EXISTS selected_broker VARCHAR(50),
ADD COLUMN IF NOT EXISTS row_count INTEGER,
ADD COLUMN IF NOT EXISTS trades_parsed INTEGER;

-- Update outcome column comment to reflect new scenarios
COMMENT ON COLUMN unknown_csv_headers.outcome IS 'Import outcome: no_parser_match, parse_failed, zero_trades, high_skip_rate, mismatch_override';

-- Add index on detected_broker for analytics queries
CREATE INDEX IF NOT EXISTS idx_unknown_csv_headers_detected_broker ON unknown_csv_headers(detected_broker);

-- Add index for tracking mismatches
CREATE INDEX IF NOT EXISTS idx_unknown_csv_headers_mismatch ON unknown_csv_headers(detected_broker, selected_broker) WHERE detected_broker != selected_broker;
