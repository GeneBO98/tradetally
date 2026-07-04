ALTER TABLE trade_playbook_reviews
ADD COLUMN IF NOT EXISTS review_type VARCHAR(30) NOT NULL DEFAULT 'adherence';

ALTER TABLE trade_playbook_reviews
DROP CONSTRAINT IF EXISTS trade_playbook_reviews_review_type_check;

ALTER TABLE trade_playbook_reviews
ADD CONSTRAINT trade_playbook_reviews_review_type_check
CHECK (review_type IN ('adherence', 'manual_grading'));

UPDATE trade_playbook_reviews r
SET review_type = CASE
  WHEN p.review_mode = 'score' THEN 'manual_grading'
  ELSE 'adherence'
END
FROM playbooks p
WHERE p.id = r.playbook_id
  AND (r.review_type IS NULL OR r.review_type = 'adherence');

ALTER TABLE trade_playbook_reviews
DROP CONSTRAINT IF EXISTS trade_playbook_reviews_trade_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_playbook_reviews_trade_type_unique
ON trade_playbook_reviews(trade_id, review_type);

CREATE INDEX IF NOT EXISTS idx_trade_playbook_reviews_user_type
ON trade_playbook_reviews(user_id, review_type);

COMMENT ON COLUMN trade_playbook_reviews.review_type IS 'Distinguishes adherence reviews from manual grading reviews on the same trade';
