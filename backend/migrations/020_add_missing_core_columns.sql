-- Add missing core columns for fresh installations
-- This migration ensures all core columns exist without breaking existing installations

-- Add missing columns to users table if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN DEFAULT TRUE;

-- Add role constraint if it doesn't exist (will be recreated by migration 001 anyway)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'owner'));
    END IF;
END $$;

-- Ensure quantity column is the correct type
DO $$
BEGIN
    -- Check if quantity is INTEGER and convert to DECIMAL if needed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'trades' 
        AND column_name = 'quantity' 
        AND data_type = 'integer'
    ) THEN
        ALTER TABLE trades ALTER COLUMN quantity TYPE DECIMAL(10, 4);
    END IF;
END $$;

-- Add missing columns to trades table if they don't exist
ALTER TABLE trades ADD COLUMN IF NOT EXISTS executions JSONB;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mae DECIMAL(10, 2) DEFAULT NULL;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS mfe DECIMAL(10, 2) DEFAULT NULL;