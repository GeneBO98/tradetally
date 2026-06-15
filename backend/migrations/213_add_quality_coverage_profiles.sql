-- Per-instrument minimum data coverage for setup quality grading (issue #352)
-- Values are integer percentages. Defaults remain 40% when this JSONB field
-- is unset, preserving existing behavior for all users.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS quality_minimum_coverage_profiles JSONB DEFAULT NULL;

COMMENT ON COLUMN users.quality_minimum_coverage_profiles IS 'Per-instrument minimum available metric weight required before setup quality is graded. Integer percentages keyed by quality profile, e.g. {"stock": 40, "option": 30}. Defaults to 40 per profile when unset.';
