-- Migration: Create referral system for creator promo codes and tracking
-- Only active when billing is enabled (tradetally.io)

-- Referral codes table
CREATE TABLE IF NOT EXISTS referral_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_name VARCHAR(100) NOT NULL,
    code VARCHAR(50) UNIQUE NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    stripe_coupon_id VARCHAR(255),
    stripe_promo_code_id VARCHAR(255),
    discount_percent INTEGER NOT NULL CHECK (discount_percent > 0 AND discount_percent <= 100),
    is_active BOOLEAN DEFAULT true,
    valid_from TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP WITH TIME ZONE,
    contact_email VARCHAR(255),
    notes TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Track link visits
CREATE TABLE IF NOT EXISTS referral_visits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
    visitor_ip_hash VARCHAR(64),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Track conversions (signups and subscriptions)
CREATE TABLE IF NOT EXISTS referral_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_code_id UUID NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    conversion_type VARCHAR(50) NOT NULL CHECK (conversion_type IN ('signup', 'subscription')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(referral_code_id, user_id, conversion_type)
);

-- Add referral tracking to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by_code UUID REFERENCES referral_codes(id);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_referral_codes_slug ON referral_codes(slug);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referral_codes_active ON referral_codes(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_referral_visits_code_id ON referral_visits(referral_code_id);
CREATE INDEX IF NOT EXISTS idx_referral_visits_created ON referral_visits(created_at);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_code_id ON referral_conversions(referral_code_id);
CREATE INDEX IF NOT EXISTS idx_referral_conversions_user_id ON referral_conversions(user_id);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by_code) WHERE referred_by_code IS NOT NULL;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_referral_codes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_referral_codes_updated_at ON referral_codes;
CREATE TRIGGER trigger_referral_codes_updated_at
    BEFORE UPDATE ON referral_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_referral_codes_updated_at();

-- Comments
COMMENT ON TABLE referral_codes IS 'Creator promo codes for referral tracking';
COMMENT ON TABLE referral_visits IS 'Track visits via referral links (/r/slug)';
COMMENT ON TABLE referral_conversions IS 'Track signups and subscriptions from referrals';
COMMENT ON COLUMN users.referred_by_code IS 'Referral code that brought this user';
