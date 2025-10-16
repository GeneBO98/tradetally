-- Migration to add missing fields needed for data export functionality
-- This ensures all required tables and columns exist for the export/import feature

-- Add 2FA support fields to users table if they don't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS two_factor_secret VARCHAR(255),
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS two_factor_backup_codes TEXT[],
ADD COLUMN IF NOT EXISTS two_factor_enabled_at TIMESTAMP WITH TIME ZONE;

-- Add admin role support
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user',
ADD COLUMN IF NOT EXISTS admin_approved BOOLEAN DEFAULT TRUE;

-- Add role check constraint if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_role_check') THEN
        ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'owner'));
    END IF;
END $$;

-- Add missing columns to user_settings if they don't exist
ALTER TABLE user_settings 
ADD COLUMN IF NOT EXISTS account_equity DECIMAL(15,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS trading_strategies TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS trading_styles TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS risk_tolerance VARCHAR(20) DEFAULT 'moderate',
ADD COLUMN IF NOT EXISTS primary_markets TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS experience_level VARCHAR(20) DEFAULT 'intermediate',
ADD COLUMN IF NOT EXISTS average_position_size VARCHAR(20) DEFAULT 'medium',
ADD COLUMN IF NOT EXISTS trading_goals TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS preferred_sectors TEXT[] DEFAULT '{}';

-- Create equity_history table if it doesn't exist (for export compatibility)
-- This provides an alias/view for the existing equity_snapshots table
CREATE TABLE IF NOT EXISTS equity_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    equity DECIMAL(15,2) NOT NULL,
    pnl DECIMAL(15,2) DEFAULT 0.00,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_equity_history_user_date ON equity_history(user_id, date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_equity_history_user_date_unique ON equity_history(user_id, date);

-- Add trigger for equity_history updated_at
CREATE OR REPLACE FUNCTION update_equity_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS equity_history_updated_at_trigger ON equity_history;
CREATE TRIGGER equity_history_updated_at_trigger
    BEFORE UPDATE ON equity_history
    FOR EACH ROW
    EXECUTE FUNCTION update_equity_history_updated_at();

-- Migrate existing equity_snapshots data to equity_history if needed
INSERT INTO equity_history (user_id, date, equity, pnl, created_at, updated_at)
SELECT 
    user_id,
    snapshot_date as date,
    equity_amount as equity,
    0.00 as pnl, -- Default PnL to 0 for migrated data
    created_at,
    updated_at
FROM equity_snapshots
WHERE NOT EXISTS (
    SELECT 1 FROM equity_history 
    WHERE equity_history.user_id = equity_snapshots.user_id 
    AND equity_history.date = equity_snapshots.snapshot_date
);

-- Add indexes for performance if they don't exist
CREATE INDEX IF NOT EXISTS idx_user_settings_trading_strategies ON user_settings USING GIN(trading_strategies);
CREATE INDEX IF NOT EXISTS idx_user_settings_trading_styles ON user_settings USING GIN(trading_styles);
CREATE INDEX IF NOT EXISTS idx_user_settings_primary_markets ON user_settings USING GIN(primary_markets);
CREATE INDEX IF NOT EXISTS idx_user_settings_trading_goals ON user_settings USING GIN(trading_goals);
CREATE INDEX IF NOT EXISTS idx_user_settings_preferred_sectors ON user_settings USING GIN(preferred_sectors);

-- Update any NULL trading profile fields to default values
UPDATE user_settings 
SET 
    trading_strategies = COALESCE(trading_strategies, '{}'),
    trading_styles = COALESCE(trading_styles, '{}'),
    risk_tolerance = COALESCE(risk_tolerance, 'moderate'),
    primary_markets = COALESCE(primary_markets, '{}'),
    experience_level = COALESCE(experience_level, 'intermediate'),
    average_position_size = COALESCE(average_position_size, 'medium'),
    trading_goals = COALESCE(trading_goals, '{}'),
    preferred_sectors = COALESCE(preferred_sectors, '{}')
WHERE 
    trading_strategies IS NULL 
    OR trading_styles IS NULL 
    OR risk_tolerance IS NULL
    OR primary_markets IS NULL 
    OR experience_level IS NULL
    OR average_position_size IS NULL
    OR trading_goals IS NULL 
    OR preferred_sectors IS NULL;

-- Show migration status
DO $$
DECLARE
    total_settings INTEGER;
    with_strategies INTEGER;
    with_equity INTEGER;
BEGIN
    SELECT
        COUNT(*),
        COUNT(CASE WHEN trading_strategies IS NOT NULL THEN 1 END),
        COUNT(CASE WHEN account_equity IS NOT NULL THEN 1 END)
    INTO total_settings, with_strategies, with_equity
    FROM user_settings;

    RAISE NOTICE 'Migration completed successfully';
    RAISE NOTICE 'Total user settings: %', total_settings;
    RAISE NOTICE 'Users with strategies: %', with_strategies;
    RAISE NOTICE 'Users with equity: %', with_equity;
END $$;