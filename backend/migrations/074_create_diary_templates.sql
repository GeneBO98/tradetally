-- Create diary entry templates system
-- This migration adds tables for users to save and reuse journal entry templates

-- Create diary_templates table
CREATE TABLE IF NOT EXISTS diary_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    entry_type VARCHAR(20) NOT NULL DEFAULT 'diary' CHECK (entry_type IN ('diary', 'playbook')),

    -- Template content fields (nullable since not all fields may be in template)
    title VARCHAR(255),
    content TEXT,
    market_bias VARCHAR(20) CHECK (market_bias IN ('bullish', 'bearish', 'neutral')),
    key_levels TEXT,
    watchlist TEXT[] DEFAULT '{}',
    tags TEXT[] DEFAULT '{}',

    -- Metadata
    is_default BOOLEAN DEFAULT FALSE,
    use_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure unique template names per user
    UNIQUE(user_id, name)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_diary_templates_user_id ON diary_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_diary_templates_entry_type ON diary_templates(entry_type);
CREATE INDEX IF NOT EXISTS idx_diary_templates_is_default ON diary_templates(is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_diary_templates_use_count ON diary_templates(use_count DESC);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_diary_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at on diary_templates
DROP TRIGGER IF EXISTS update_diary_templates_updated_at ON diary_templates;
CREATE TRIGGER update_diary_templates_updated_at
    BEFORE UPDATE ON diary_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_diary_templates_updated_at();

-- Add comments for documentation
COMMENT ON TABLE diary_templates IS 'Reusable templates for diary and playbook entries';
COMMENT ON COLUMN diary_templates.name IS 'User-defined name for the template';
COMMENT ON COLUMN diary_templates.description IS 'Optional description of when to use this template';
COMMENT ON COLUMN diary_templates.entry_type IS 'Type of entry this template is for: diary or playbook';
COMMENT ON COLUMN diary_templates.is_default IS 'Whether this template should be auto-applied for new entries';
COMMENT ON COLUMN diary_templates.use_count IS 'Number of times this template has been applied';
