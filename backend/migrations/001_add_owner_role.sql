-- Migration: Add owner role to users table
-- This allows for an owner role that supersedes admin

-- Add role column if it doesn't exist (for fresh installs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';

-- Add admin_approved column if it doesn't exist (for fresh installs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN DEFAULT TRUE;

-- First, drop the existing constraint
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;

-- Add the new constraint with owner role
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'owner'));

-- Add columns for verification tokens and password reset if they don't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMP WITH TIME ZONE;