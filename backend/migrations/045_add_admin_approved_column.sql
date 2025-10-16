-- Migration 045: Add admin_approved column to users table for registration control
-- This migration should be run when updating to the new registration system

-- Add the admin_approved column with default value of true (for existing users)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN DEFAULT true;

-- Update all existing users to be approved by default
UPDATE users SET admin_approved = true WHERE admin_approved IS NULL;

-- Create index for performance on admin approval queries
CREATE INDEX IF NOT EXISTS idx_users_admin_approved ON users(admin_approved);