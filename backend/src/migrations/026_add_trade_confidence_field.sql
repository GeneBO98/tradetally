-- Add confidence level field to trades table
ALTER TABLE trades 
ADD COLUMN confidence INTEGER CHECK (confidence >= 1 AND confidence <= 10);

-- Add index for filtering by confidence level
CREATE INDEX idx_trades_confidence ON trades(confidence);

-- Update existing trades to have a default confidence level of 5 (neutral)
UPDATE trades SET confidence = 5 WHERE confidence IS NULL;