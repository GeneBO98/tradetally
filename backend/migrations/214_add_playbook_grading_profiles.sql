ALTER TABLE playbooks
ADD COLUMN IF NOT EXISTS review_mode VARCHAR(20) NOT NULL DEFAULT 'checklist';

ALTER TABLE playbooks
DROP CONSTRAINT IF EXISTS playbooks_review_mode_check;

ALTER TABLE playbooks
ADD CONSTRAINT playbooks_review_mode_check
CHECK (review_mode IN ('checklist', 'score'));

ALTER TABLE playbooks
ADD COLUMN IF NOT EXISTS auto_assign_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN playbooks.review_mode IS 'Manual review mode: checklist pass/fail or 0-5 score criteria';
COMMENT ON COLUMN playbooks.auto_assign_enabled IS 'Whether this active playbook can be suggested for matching unreviewed trades';
