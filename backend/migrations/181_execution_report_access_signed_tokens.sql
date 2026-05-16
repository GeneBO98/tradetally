BEGIN;

ALTER TABLE execution_run_report_accesses
  ALTER COLUMN share_token TYPE TEXT;

COMMIT;
