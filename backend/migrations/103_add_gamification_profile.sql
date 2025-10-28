-- Migration: Add gamification_profile table
-- This table stores user profile information for the gamification system
-- It was previously created manually but needs to be in migrations for production deployment

CREATE TABLE IF NOT EXISTS gamification_profile (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_gamification_profile_user_id ON gamification_profile(user_id);

-- Add comment to table
COMMENT ON TABLE gamification_profile IS 'Stores user profile information for the gamification system';
