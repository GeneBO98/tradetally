-- Migration: Ensure schema consistency for trade_attachments and trades tables
-- This fixes missing columns that should exist based on the model expectations

-- Ensure trade_attachments table has uploaded_at column (rename from created_at if it exists)
DO $$ 
BEGIN
    -- Check if uploaded_at exists, if not but created_at does, rename it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trade_attachments' AND column_name = 'uploaded_at'
    ) THEN
        -- If created_at exists, rename it to uploaded_at
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'trade_attachments' AND column_name = 'created_at'
        ) THEN
            ALTER TABLE trade_attachments RENAME COLUMN created_at TO uploaded_at;
        ELSE
            -- Add uploaded_at column if neither exists
            ALTER TABLE trade_attachments ADD COLUMN uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
        END IF;
    END IF;
END $$;

-- Ensure trades table has setup column
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trades' AND column_name = 'setup'
    ) THEN
        ALTER TABLE trades ADD COLUMN setup VARCHAR(100);
    END IF;
END $$;

-- Ensure trades table has confidence column (referenced in model)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trades' AND column_name = 'confidence'
    ) THEN
        ALTER TABLE trades ADD COLUMN confidence INTEGER DEFAULT 5;
    END IF;
END $$;