CREATE TABLE IF NOT EXISTS http_security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(80) NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'warning',
  origin TEXT,
  path TEXT,
  host TEXT,
  status_code INTEGER,
  directive TEXT,
  blocked_uri TEXT,
  document_uri TEXT,
  user_agent TEXT,
  request_id UUID,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_http_security_events_type_created
  ON http_security_events (event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_http_security_events_created
  ON http_security_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_http_security_events_payload_gin
  ON http_security_events USING GIN (payload);

COMMENT ON TABLE http_security_events IS 'Append-only HTTP/CSP/CORS/static asset security events for admin audit and anomaly investigation';
