BEGIN;

ALTER TABLE operational_alert_escalation_deliveries
  ADD COLUMN IF NOT EXISTS retry_lease_id TEXT,
  ADD COLUMN IF NOT EXISTS retry_lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dead_lettered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dead_letter_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_alert_escalation_deliveries_retry_lease
  ON operational_alert_escalation_deliveries(next_retry_at, retry_lease_until, attempted_at)
  WHERE status IN ('failed', 'skipped')
    AND next_retry_at IS NOT NULL
    AND dead_lettered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_alert_escalation_deliveries_dead_letter
  ON operational_alert_escalation_deliveries(dead_lettered_at DESC)
  WHERE dead_lettered_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS operational_alert_escalation_destination_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_id UUID REFERENCES operational_alert_escalation_destinations(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'enable', 'disable', 'delete')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'applied')),
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_destination_change_requests_status
  ON operational_alert_escalation_destination_change_requests(status, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_destination_change_requests_destination
  ON operational_alert_escalation_destination_change_requests(destination_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS execution_report_template_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL,
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  before_template JSONB NOT NULL DEFAULT '{}'::jsonb,
  after_template JSONB NOT NULL DEFAULT '{}'::jsonb,
  diff_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected', 'applied', 'rolled_back')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_execution_report_template_revisions_key_requested
  ON execution_report_template_revisions(template_key, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_report_template_revisions_status
  ON execution_report_template_revisions(approval_status, requested_at DESC);

CREATE TABLE IF NOT EXISTS import_account_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  import_id UUID REFERENCES import_logs(id) ON DELETE SET NULL,
  account_identifier TEXT NOT NULL,
  broker TEXT,
  source TEXT NOT NULL DEFAULT 'csv_import',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved', 'ignored')),
  sample_count INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  resolved_account_id UUID REFERENCES user_accounts(id) ON DELETE SET NULL,
  last_error TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  UNIQUE (user_id, account_identifier, source)
);

CREATE INDEX IF NOT EXISTS idx_import_account_reconciliations_user_status
  ON import_account_reconciliations(user_id, status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_account_reconciliations_import
  ON import_account_reconciliations(import_id, last_seen_at DESC);

COMMIT;
