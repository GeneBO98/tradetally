-- Add quality_grade field to trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS quality_grade VARCHAR(1);

-- Add quality_score field to store the numeric score (0-5)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS quality_score INTEGER;

-- Add quality_metrics field to store detailed metrics as JSONB
ALTER TABLE trades ADD COLUMN IF NOT EXISTS quality_metrics JSONB;

-- Create index on quality_grade for filtering
CREATE INDEX IF NOT EXISTS idx_trades_quality_grade ON trades(quality_grade);

-- Add comment
COMMENT ON COLUMN trades.quality_grade IS 'Trade quality grade: A (5/5), B (4/5), C (3/5), D (2/5), F (0-1/5)';
COMMENT ON COLUMN trades.quality_score IS 'Numeric quality score from 0 to 5';
COMMENT ON COLUMN trades.quality_metrics IS 'Detailed metrics used for quality calculation: float, relativeVolume, priceRange, gap, newsSentiment';
