-- Migration 070: Add split commission fields and default broker setting
-- This migration adds entry_commission and exit_commission fields to trades table
-- and adds default_broker to user_settings table

-- Add entry_commission and exit_commission to trades table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trades' AND column_name = 'entry_commission'
    ) THEN
        ALTER TABLE trades ADD COLUMN entry_commission DECIMAL(15,6) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'trades' AND column_name = 'exit_commission'
    ) THEN
        ALTER TABLE trades ADD COLUMN exit_commission DECIMAL(15,6) DEFAULT 0;
    END IF;
END $$;

-- Migrate existing commission data to entry_commission (since most commissions are entry commissions)
-- Only update rows where entry_commission is null or 0
UPDATE trades
SET entry_commission = commission
WHERE entry_commission IS NULL OR entry_commission = 0;

-- Add default_broker to user_settings table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'user_settings' AND column_name = 'default_broker'
    ) THEN
        ALTER TABLE user_settings ADD COLUMN default_broker VARCHAR(100);
    END IF;
END $$;

-- Add comment to explain the columns
COMMENT ON COLUMN trades.entry_commission IS 'Commission paid on entry of the trade';
COMMENT ON COLUMN trades.exit_commission IS 'Commission paid on exit of the trade';
COMMENT ON COLUMN user_settings.default_broker IS 'Default broker for new trades';
