-- Add option_type column to instrument_templates if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'instrument_templates' AND column_name = 'option_type'
    ) THEN
        ALTER TABLE instrument_templates ADD COLUMN option_type VARCHAR(10);
    END IF;
END $$;
