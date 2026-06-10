-- AI Weekly Edge Report
-- Stores the weekly coaching digest ("here's your edge and your leak this week")
-- generated from existing analytics. One report per user per report week.

CREATE TABLE IF NOT EXISTS edge_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  report JSONB NOT NULL,
  narrative TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, period_start)
);

CREATE INDEX IF NOT EXISTS idx_edge_reports_user_period
  ON edge_reports(user_id, period_start DESC);

-- Opt-in flag: existing users are NOT enrolled automatically.
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS edge_report_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON TABLE edge_reports IS 'Weekly AI edge reports: structured analytics digest (report JSONB) plus an optional AI/deterministic coaching narrative.';
COMMENT ON COLUMN user_settings.edge_report_enabled IS 'When true, the user receives the weekly AI edge report email (opt-in).';
