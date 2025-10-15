-- Add Post-Market Reflection fields to diary_templates table
-- Migration: 077
-- Description: Add followed_plan and lessons_learned fields to diary templates

ALTER TABLE diary_templates
ADD COLUMN IF NOT EXISTS followed_plan BOOLEAN DEFAULT NULL,
ADD COLUMN IF NOT EXISTS lessons_learned TEXT DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN diary_templates.followed_plan IS 'Default value for "Did you follow your plan?" field in Post-Market Reflection';
COMMENT ON COLUMN diary_templates.lessons_learned IS 'Default template text for lessons learned section in Post-Market Reflection';
