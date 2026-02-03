-- Store CSV header lines from import attempts that don't match a known broker or fail to parse
-- so we can add or improve parsers
CREATE TABLE IF NOT EXISTS unknown_csv_headers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  header_line TEXT NOT NULL,
  broker_attempted VARCHAR(50) NOT NULL,
  outcome VARCHAR(50) NOT NULL,
  file_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_unknown_csv_headers_created_at ON unknown_csv_headers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unknown_csv_headers_outcome ON unknown_csv_headers(outcome);

COMMENT ON TABLE unknown_csv_headers IS 'CSV header lines from imports with no parser match or parse failure; for improving broker detection';
