ALTER TABLE web_mention_rules
ADD COLUMN IF NOT EXISTS source_ids UUID[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_web_mention_rules_source_ids
ON web_mention_rules USING GIN(source_ids);
