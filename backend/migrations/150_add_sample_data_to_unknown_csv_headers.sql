-- Add sample_data column to store the first few data rows of the CSV
-- This helps with building new parsers by showing the data structure

ALTER TABLE unknown_csv_headers
ADD COLUMN IF NOT EXISTS sample_data TEXT;

COMMENT ON COLUMN unknown_csv_headers.sample_data IS 'First 5 data rows after the header line, for parser development context';
