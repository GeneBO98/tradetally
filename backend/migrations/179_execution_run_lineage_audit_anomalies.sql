-- Strengthen execution-run lineage, workflow confidence settings, and operations auditability.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'execution_runs_lineage_pair_check'
  ) THEN
    ALTER TABLE execution_runs
    ADD CONSTRAINT execution_runs_lineage_pair_check
    CHECK (
      (parent_run_id IS NULL AND lineage_type IS NULL)
      OR
      (parent_run_id IS NOT NULL AND lineage_type IS NOT NULL)
    ) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION validate_execution_run_lineage()
RETURNS trigger AS $$
DECLARE
  parent_record RECORD;
BEGIN
  IF NEW.parent_run_id IS NULL AND NEW.lineage_type IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_run_id IS NULL OR NEW.lineage_type IS NULL THEN
    RAISE EXCEPTION 'execution run lineage requires parent_run_id and lineage_type together'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.parent_run_id = NEW.id THEN
    RAISE EXCEPTION 'execution run cannot be its own parent'
      USING ERRCODE = '23514';
  END IF;

  SELECT id, user_id, mode
  INTO parent_record
  FROM execution_runs
  WHERE id = NEW.parent_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'execution run parent does not exist'
      USING ERRCODE = '23503';
  END IF;

  IF parent_record.user_id <> NEW.user_id THEN
    RAISE EXCEPTION 'execution run parent must belong to the same user'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.lineage_type = 'replay_of' AND NOT (NEW.mode = 'replay' AND parent_record.mode = 'live') THEN
    RAISE EXCEPTION 'replay_of lineage requires replay child and live parent'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.lineage_type = 'backtest_of' AND NOT (NEW.mode = 'backtest' AND parent_record.mode = 'replay') THEN
    RAISE EXCEPTION 'backtest_of lineage requires backtest child and replay parent'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.lineage_type = 'rerun_of' AND NEW.mode <> parent_record.mode THEN
    RAISE EXCEPTION 'rerun_of lineage requires parent and child to use the same mode'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_execution_run_lineage ON execution_runs;
CREATE TRIGGER trg_validate_execution_run_lineage
BEFORE INSERT OR UPDATE OF user_id, mode, parent_run_id, lineage_type
ON execution_runs
FOR EACH ROW
EXECUTE FUNCTION validate_execution_run_lineage();

CREATE TABLE IF NOT EXISTS execution_workflow_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source VARCHAR(120) NOT NULL UNIQUE,
  confidence_levels JSONB NOT NULL DEFAULT '[0.9, 0.95, 0.99]'::jsonb
    CHECK (jsonb_typeof(confidence_levels) = 'array'),
  shared_report_access_threshold INTEGER NOT NULL DEFAULT 10
    CHECK (shared_report_access_threshold BETWEEN 2 AND 10000),
  shared_report_access_window_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (shared_report_access_window_minutes BETWEEN 1 AND 1440),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO execution_workflow_settings (
  source, confidence_levels, shared_report_access_threshold, shared_report_access_window_minutes
)
VALUES
  ('default', '[0.9, 0.95, 0.99]'::jsonb, 10, 15),
  ('trade-management', '[0.9, 0.95, 0.99]'::jsonb, 10, 15)
ON CONFLICT (source) DO NOTHING;

CREATE TABLE IF NOT EXISTS operational_alert_action_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id UUID REFERENCES operational_alerts(id) ON DELETE SET NULL,
  alert_type VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80),
  entity_id UUID,
  action VARCHAR(80) NOT NULL,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  status_before VARCHAR(20),
  status_after VARCHAR(20),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operational_alert_action_audits_created
ON operational_alert_action_audits(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operational_alert_action_audits_alert
ON operational_alert_action_audits(alert_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_run_report_accesses_shared_window
ON execution_run_report_accesses(access_type, created_at DESC, run_id)
WHERE access_type = 'shared';
