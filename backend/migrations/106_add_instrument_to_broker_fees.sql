-- Migration 106: Add instrument column to broker_fee_settings
-- This allows per-instrument fee configuration within each broker

-- Add instrument column if it doesn't exist
ALTER TABLE broker_fee_settings
ADD COLUMN IF NOT EXISTS instrument VARCHAR(50) NOT NULL DEFAULT '';

-- Drop the old unique constraint if it exists (broker + user_id only)
ALTER TABLE broker_fee_settings
DROP CONSTRAINT IF EXISTS broker_fee_settings_user_id_broker_key;

-- Add new unique constraint including instrument
ALTER TABLE broker_fee_settings
ADD CONSTRAINT broker_fee_settings_user_id_broker_instrument_key UNIQUE (user_id, broker, instrument);

-- Add index for faster lookups by instrument
CREATE INDEX IF NOT EXISTS idx_broker_fee_settings_user_broker_instrument
ON broker_fee_settings(user_id, broker, instrument);

-- Update comment
COMMENT ON COLUMN broker_fee_settings.instrument IS 'Instrument/symbol this fee applies to (empty string = broker-wide default)';
