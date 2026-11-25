-- Journal tag suggestions: product feedback signals, not verified training labels. No note/evidence text.
CREATE TABLE IF NOT EXISTS journal_tag_suggestion_runs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_id UUID REFERENCES diary_entries(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  classifier_version INTEGER NOT NULL,
  decisions JSONB NOT NULL,
  baseline_tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  shown_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '90 days'
);
-- Databases that created this table from an earlier draft lack these columns.
ALTER TABLE journal_tag_suggestion_runs ADD COLUMN IF NOT EXISTS baseline_tags JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE journal_tag_suggestion_runs ADD COLUMN IF NOT EXISTS shown_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_journal_tag_runs_owner ON journal_tag_suggestion_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_journal_tag_runs_expiry ON journal_tag_suggestion_runs(expires_at);
CREATE INDEX IF NOT EXISTS idx_journal_tag_runs_entry ON journal_tag_suggestion_runs(entry_id) WHERE entry_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS journal_tag_suggestion_feedback (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES journal_tag_suggestion_runs(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN (
    'shown', 'accepted', 'dismissed', 'removed',
    'saved_accepted', 'saved_not_selected', 'manual_added'
  )),
  -- A repeat of the same client event or save is idempotent. Later user
  -- actions have different keys and remain distinct observations.
  event_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, tag, action, event_key)
);
CREATE INDEX IF NOT EXISTS idx_journal_tag_feedback_run ON journal_tag_suggestion_feedback(run_id);
