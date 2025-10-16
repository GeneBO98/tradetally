-- Migration 046: Add trading profile fields to user_settings table
-- This migration adds comprehensive trading profile customization options

-- Add trading profile columns to user_settings table
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS trading_strategies TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS trading_styles TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS risk_tolerance VARCHAR(20) DEFAULT 'moderate',
ADD COLUMN IF NOT EXISTS primary_markets TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS experience_level VARCHAR(20) DEFAULT 'intermediate',
ADD COLUMN IF NOT EXISTS average_position_size VARCHAR(20) DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS trading_goals TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS preferred_sectors TEXT[] DEFAULT '{}';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_settings_trading_strategies ON user_settings USING GIN(trading_strategies);
CREATE INDEX IF NOT EXISTS idx_user_settings_trading_styles ON user_settings USING GIN(trading_styles);
CREATE INDEX IF NOT EXISTS idx_user_settings_primary_markets ON user_settings USING GIN(primary_markets);

-- Insert default trading profile data for existing users who don't have it
UPDATE user_settings 
SET 
  trading_strategies = '{}',
  trading_styles = '{}',
  primary_markets = '{}',
  trading_goals = '{}',
  preferred_sectors = '{}'
WHERE
  trading_strategies IS NULL
  OR trading_styles IS NULL
  OR primary_markets IS NULL
  OR trading_goals IS NULL
  OR preferred_sectors IS NULL;