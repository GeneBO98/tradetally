-- Migration 105: Add broker fee settings table
-- This table stores default commission and fee rates per broker/instrument for each user
-- If instrument is empty string '', the setting applies as the broker-wide default
-- If instrument is specified, it applies only to that instrument (with fallback to broker default)

CREATE TABLE IF NOT EXISTS broker_fee_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    broker VARCHAR(100) NOT NULL,
    instrument VARCHAR(50) NOT NULL DEFAULT '',
    commission_per_contract DECIMAL(12,6) DEFAULT 0,
    commission_per_side DECIMAL(12,6) DEFAULT 0,
    exchange_fee_per_contract DECIMAL(12,6) DEFAULT 0,
    nfa_fee_per_contract DECIMAL(12,6) DEFAULT 0,
    clearing_fee_per_contract DECIMAL(12,6) DEFAULT 0,
    platform_fee_per_contract DECIMAL(12,6) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, broker, instrument)
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_broker_fee_settings_user_broker ON broker_fee_settings(user_id, broker);
CREATE INDEX IF NOT EXISTS idx_broker_fee_settings_user_broker_instrument ON broker_fee_settings(user_id, broker, instrument);

-- Add comments
COMMENT ON TABLE broker_fee_settings IS 'Stores default commission and fee rates per broker/instrument for each user';
COMMENT ON COLUMN broker_fee_settings.instrument IS 'Instrument/symbol this fee applies to (NULL = broker-wide default)';
COMMENT ON COLUMN broker_fee_settings.commission_per_contract IS 'Broker commission per contract/share (applied to each side)';
COMMENT ON COLUMN broker_fee_settings.commission_per_side IS 'Fixed commission per trade side (entry or exit)';
COMMENT ON COLUMN broker_fee_settings.exchange_fee_per_contract IS 'Exchange fees per contract (e.g., CME fees)';
COMMENT ON COLUMN broker_fee_settings.nfa_fee_per_contract IS 'NFA regulatory fee per contract (typically $0.02)';
COMMENT ON COLUMN broker_fee_settings.clearing_fee_per_contract IS 'Clearing fees per contract';
COMMENT ON COLUMN broker_fee_settings.platform_fee_per_contract IS 'Trading platform fees per contract';
