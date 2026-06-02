ALTER TABLE web_mention_rules
ADD COLUMN IF NOT EXISTS term_match_threshold INTEGER NOT NULL DEFAULT 1;

ALTER TABLE web_mention_rules
DROP CONSTRAINT IF EXISTS web_mention_rules_term_match_threshold_check;

ALTER TABLE web_mention_rules
ADD CONSTRAINT web_mention_rules_term_match_threshold_check
CHECK (term_match_threshold BETWEEN 1 AND 25);
