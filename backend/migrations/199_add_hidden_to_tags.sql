-- Add a "hidden" flag to tags so users can keep their tag dropdowns clean.
-- Hidden tags stay attached to existing trades but are excluded from the
-- selection dropdowns and autocomplete suggestions.
ALTER TABLE tags ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
