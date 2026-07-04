-- Per-instrument quality grading weight profiles (issue #352)
-- Stocks and options use different metric sets, so a flat set of weight
-- columns no longer fits. Profiles are stored as JSONB keyed by instrument
-- type, e.g.:
--   {
--     "stock":  { "news": 30, "gap": 20, "relativeVolume": 20, "float": 15, "priceRange": 15 },
--     "option": { "news": 25, "gap": 15, "relativeVolume": 15, "dte": 25, "moneyness": 20 }
--   }
-- The legacy quality_weight_* columns are kept and remain the fallback for
-- the stock profile when no JSONB profile is set.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS quality_weight_profiles JSONB DEFAULT NULL;

COMMENT ON COLUMN users.quality_weight_profiles IS 'Per-instrument quality grading weight profiles, percentages summing to 100 per profile. Falls back to quality_weight_* columns (stock) and built-in defaults when unset.';

-- Seed the stock profile for users who customized the legacy columns, so
-- their settings carry over to the new profile structure.
UPDATE users
SET quality_weight_profiles = jsonb_build_object(
  'stock', jsonb_build_object(
    'news', quality_weight_news,
    'gap', quality_weight_gap,
    'relativeVolume', quality_weight_relative_volume,
    'float', quality_weight_float,
    'priceRange', quality_weight_price_range
  )
)
WHERE quality_weight_profiles IS NULL
  AND (
    quality_weight_news IS DISTINCT FROM 30
    OR quality_weight_gap IS DISTINCT FROM 20
    OR quality_weight_relative_volume IS DISTINCT FROM 20
    OR quality_weight_float IS DISTINCT FROM 15
    OR quality_weight_price_range IS DISTINCT FROM 15
  );
