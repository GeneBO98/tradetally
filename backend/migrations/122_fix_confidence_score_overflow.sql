-- Fix numeric field overflow for confidence_score in strategy_classification_history
-- The field was numeric(3,2) which can only hold values up to 9.99
-- But strategy_confidence is stored as percentage (0-100), so it needs numeric(5,2)

ALTER TABLE strategy_classification_history
ALTER COLUMN confidence_score TYPE NUMERIC(5,2);

COMMENT ON COLUMN strategy_classification_history.confidence_score IS
'Strategy classification confidence as a percentage (0-100)';
