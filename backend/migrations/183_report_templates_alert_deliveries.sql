BEGIN;

CREATE TABLE IF NOT EXISTS execution_report_templates (
  template_key TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  description TEXT,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  share_defaults JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (template_key ~ '^[a-z0-9_.:-]{1,80}$')
);

CREATE INDEX IF NOT EXISTS idx_execution_report_templates_enabled
  ON execution_report_templates(is_enabled, template_key);

INSERT INTO execution_report_templates (template_key, label, description, sections, share_defaults)
VALUES
  (
    'trader',
    'Trader Workbook',
    'Process-quality report focused on setup, R-multiple, MAE/MFE, behavior, and replay/backtest comparison.',
    '[
      {"key":"audience","label":"Audience Report Template","enabled":true},
      {"key":"overview","label":"Run Overview","enabled":true},
      {"key":"lineage","label":"Lineage and Reproducibility","enabled":true},
      {"key":"provenance","label":"Data Provenance","enabled":true},
      {"key":"metrics","label":"Metrics","enabled":true},
      {"key":"confidence","label":"Confidence","enabled":true},
      {"key":"events","label":"Event Timeline","enabled":true}
    ]'::jsonb,
    '{"formats":["json","pdf"],"includeEvents":true,"includeMetrics":true,"includeReportAccesses":false}'::jsonb
  ),
  (
    'prop_firm',
    'Prop Firm Risk Review',
    'Risk-control report focused on daily loss, max drawdown, consistency, lineage, and audit trail.',
    '[
      {"key":"audience","label":"Audience Report Template","enabled":true},
      {"key":"overview","label":"Run Overview","enabled":true},
      {"key":"lineage","label":"Lineage and Reproducibility","enabled":true},
      {"key":"provenance","label":"Data Provenance","enabled":true},
      {"key":"metrics","label":"Risk Metrics","enabled":true},
      {"key":"confidence","label":"Confidence","enabled":true},
      {"key":"events","label":"Event Timeline","enabled":true},
      {"key":"access","label":"Report Access Audit","enabled":true}
    ]'::jsonb,
    '{"formats":["json","pdf"],"includeEvents":true,"includeMetrics":true,"includeReportAccesses":true}'::jsonb
  ),
  (
    'investor',
    'Investor Summary',
    'Performance and reproducibility report focused on expectancy, drawdown, confidence, and provenance.',
    '[
      {"key":"audience","label":"Audience Report Template","enabled":true},
      {"key":"overview","label":"Run Overview","enabled":true},
      {"key":"lineage","label":"Lineage and Reproducibility","enabled":true},
      {"key":"provenance","label":"Data Provenance","enabled":true},
      {"key":"metrics","label":"Performance Metrics","enabled":true},
      {"key":"confidence","label":"Confidence","enabled":true},
      {"key":"access","label":"Report Access Audit","enabled":true}
    ]'::jsonb,
    '{"formats":["json","pdf"],"includeEvents":false,"includeMetrics":true,"includeReportAccesses":true}'::jsonb
  ),
  (
    'tax_accounting',
    'Tax and Accounting Packet',
    'Realized PnL, fees, account, instrument classification, assignment, margin, and export trail report.',
    '[
      {"key":"audience","label":"Audience Report Template","enabled":true},
      {"key":"overview","label":"Run Overview","enabled":true},
      {"key":"lineage","label":"Lineage and Reproducibility","enabled":true},
      {"key":"provenance","label":"Data Provenance","enabled":true},
      {"key":"derivatives","label":"Options, Futures, and Margin","enabled":true},
      {"key":"metrics","label":"Accounting Metrics","enabled":true},
      {"key":"access","label":"Report Access Audit","enabled":true},
      {"key":"shareAudit","label":"Share Link Audit","enabled":true}
    ]'::jsonb,
    '{"formats":["json","csv","pdf"],"includeEvents":false,"includeMetrics":true,"includeReportAccesses":true}'::jsonb
  )
ON CONFLICT (template_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS operational_alert_escalation_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES operational_alerts(id) ON DELETE SET NULL,
  destination_id UUID REFERENCES operational_alert_escalation_destinations(id) ON DELETE SET NULL,
  destination_type TEXT NOT NULL CHECK (destination_type IN ('email', 'slack', 'webhook')),
  target TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_status INTEGER,
  error_message TEXT,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_escalation_deliveries_alert
  ON operational_alert_escalation_deliveries(alert_id, attempted_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_escalation_deliveries_destination
  ON operational_alert_escalation_deliveries(destination_id, attempted_at DESC);

COMMIT;
