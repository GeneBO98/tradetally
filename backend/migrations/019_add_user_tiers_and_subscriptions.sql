-- Add user tiers and subscription support
-- This migration adds support for free and pro tiers with optional billing

-- Add tier column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'free' CHECK (tier IN ('free', 'pro'));

-- Create subscriptions table for Stripe integration
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_customer_id VARCHAR(255) UNIQUE,
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_price_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'inactive',
    current_period_start TIMESTAMP WITH TIME ZONE,
    current_period_end TIMESTAMP WITH TIME ZONE,
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    canceled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create tier overrides table for admin manual tier assignments
CREATE TABLE IF NOT EXISTS tier_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tier VARCHAR(20) NOT NULL CHECK (tier IN ('free', 'pro')),
    reason TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- Create features table for future feature definitions
CREATE TABLE IF NOT EXISTS features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    feature_key VARCHAR(100) UNIQUE NOT NULL,
    feature_name VARCHAR(255) NOT NULL,
    description TEXT,
    required_tier VARCHAR(20) NOT NULL CHECK (required_tier IN ('free', 'pro')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add billing configuration to instance_config
INSERT INTO instance_config (key, value, description, is_public) VALUES
    ('billing_enabled', 'false'::jsonb, 'Enable Stripe billing integration', false),
    ('stripe_webhook_endpoint_secret', '""'::jsonb, 'Stripe webhook endpoint secret for signature verification', false)
ON CONFLICT (key) DO NOTHING;

-- Add billing settings to admin_settings
INSERT INTO admin_settings (setting_key, setting_value) VALUES
    ('stripe_publishable_key', ''),
    ('stripe_secret_key', ''),
    ('stripe_price_id_monthly', ''),
    ('stripe_price_id_yearly', '')
ON CONFLICT (setting_key) DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_tier_overrides_user_id ON tier_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_features_feature_key ON features(feature_key);
CREATE INDEX IF NOT EXISTS idx_features_required_tier ON features(required_tier);

-- Create function to update subscription updated_at timestamp
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_updated_at();

DROP TRIGGER IF EXISTS update_tier_overrides_updated_at ON tier_overrides;
CREATE TRIGGER update_tier_overrides_updated_at
    BEFORE UPDATE ON tier_overrides
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_updated_at();

DROP TRIGGER IF EXISTS update_features_updated_at ON features;
CREATE TRIGGER update_features_updated_at
    BEFORE UPDATE ON features
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_updated_at();

-- Add comments
COMMENT ON COLUMN users.tier IS 'User subscription tier: free or pro';
COMMENT ON TABLE subscriptions IS 'Stripe subscription data for pro users';
COMMENT ON TABLE tier_overrides IS 'Admin-assigned tier overrides';
COMMENT ON TABLE features IS 'Feature definitions and tier requirements';