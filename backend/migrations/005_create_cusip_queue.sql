-- Create CUSIP lookup queue table
CREATE TABLE IF NOT EXISTS cusip_lookup_queue (
  id SERIAL PRIMARY KEY,
  cusip VARCHAR(9) NOT NULL UNIQUE,
  status VARCHAR(20) DEFAULT 'pending',
  attempts INTEGER DEFAULT 0,
  max_attempts INTEGER DEFAULT 5,
  last_attempt_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  error_message TEXT,
  priority INTEGER DEFAULT 1
);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_cusip_queue_status ON cusip_lookup_queue(status);
CREATE INDEX IF NOT EXISTS idx_cusip_queue_priority ON cusip_lookup_queue(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_cusip_queue_cusip ON cusip_lookup_queue(cusip);

-- Comments
COMMENT ON TABLE cusip_lookup_queue IS 'Queue for CUSIP to ticker symbol resolution with retry logic';
COMMENT ON COLUMN cusip_lookup_queue.status IS 'pending, processing, completed, failed';
COMMENT ON COLUMN cusip_lookup_queue.priority IS 'Higher numbers = higher priority';