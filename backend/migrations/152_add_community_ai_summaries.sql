CREATE TABLE IF NOT EXISTS community_ai_summaries (
  id SERIAL PRIMARY KEY,
  period VARCHAR(10) NOT NULL DEFAULT 'all',
  instrument_types VARCHAR(100) DEFAULT 'all',
  summary TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(period, instrument_types)
);
