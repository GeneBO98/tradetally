ALTER TABLE web_mention_rules
ALTER COLUMN threshold_count SET DEFAULT 1;

UPDATE web_mention_rules
SET threshold_count = 1
WHERE threshold_count = 3;
