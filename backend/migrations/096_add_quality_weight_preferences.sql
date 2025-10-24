-- Add user-customizable quality grading weight preferences
-- Allows each user to adjust the importance of each metric in quality calculations

-- Add columns for quality weight preferences (stored as integers 0-100, representing percentages)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS quality_weight_news INTEGER DEFAULT 30 CHECK (quality_weight_news >= 0 AND quality_weight_news <= 100),
ADD COLUMN IF NOT EXISTS quality_weight_gap INTEGER DEFAULT 20 CHECK (quality_weight_gap >= 0 AND quality_weight_gap <= 100),
ADD COLUMN IF NOT EXISTS quality_weight_relative_volume INTEGER DEFAULT 20 CHECK (quality_weight_relative_volume >= 0 AND quality_weight_relative_volume <= 100),
ADD COLUMN IF NOT EXISTS quality_weight_float INTEGER DEFAULT 15 CHECK (quality_weight_float >= 0 AND quality_weight_float <= 100),
ADD COLUMN IF NOT EXISTS quality_weight_price_range INTEGER DEFAULT 15 CHECK (quality_weight_price_range >= 0 AND quality_weight_price_range <= 100);

-- Add a check constraint to ensure weights sum to 100
ALTER TABLE users
ADD CONSTRAINT quality_weights_sum_check
CHECK (
  (quality_weight_news + quality_weight_gap + quality_weight_relative_volume +
   quality_weight_float + quality_weight_price_range) = 100
);

-- Create index for faster lookups when calculating quality scores
CREATE INDEX IF NOT EXISTS idx_users_quality_weights
ON users(id, quality_weight_news, quality_weight_gap, quality_weight_relative_volume, quality_weight_float, quality_weight_price_range);

-- Update existing users to have default weights (30, 20, 20, 15, 15)
UPDATE users
SET
  quality_weight_news = 30,
  quality_weight_gap = 20,
  quality_weight_relative_volume = 20,
  quality_weight_float = 15,
  quality_weight_price_range = 15
WHERE quality_weight_news IS NULL;
