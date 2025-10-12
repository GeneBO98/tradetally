-- Migration: Add instance configuration support
-- This migration adds support for instance-specific configuration
-- to enable both cloud and self-hosted deployments

-- Create instance_config table for storing instance-specific settings
CREATE TABLE IF NOT EXISTS instance_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT FALSE, -- Whether this config is exposed to clients
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default instance configuration
INSERT INTO instance_config (key, value, description, is_public) VALUES
    ('instance_name', '"TradeTally"'::jsonb, 'Display name for this instance', true),
    ('instance_url', '""'::jsonb, 'Base URL for this instance', true),
    ('api_version', '"v1"'::jsonb, 'Current API version', true),
    ('features', '{
        "mobile_sync": true,
        "push_notifications": false,
        "biometric_auth": true,
        "offline_mode": true,
        "multi_device": true,
        "api_keys": false,
        "webhooks": false
    }'::jsonb, 'Feature flags for this instance', true),
    ('mobile_config', '{
        "min_app_version": "1.0.0",
        "force_update_version": null,
        "sync_interval_seconds": 300,
        "offline_cache_days": 30,
        "max_devices_per_user": 10,
        "session_timeout_minutes": 15,
        "refresh_token_days": 30
    }'::jsonb, 'Mobile app configuration', true),
    ('security_config', '{
        "require_https": true,
        "cors_origins": ["http://localhost:5173"],
        "rate_limit_requests": 1000,
        "rate_limit_window_minutes": 15,
        "password_min_length": 8,
        "password_require_special": false,
        "mfa_enabled": false,
        "session_idle_timeout_minutes": 60
    }'::jsonb, 'Security configuration', false)
ON CONFLICT (key) DO NOTHING;

-- Create trigger to update instance_config.updated_at (only if it doesn't exist)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers
                   WHERE trigger_name = 'update_instance_config_updated_at'
                   AND event_object_table = 'instance_config') THEN
        CREATE TRIGGER update_instance_config_updated_at
        BEFORE UPDATE ON instance_config
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- Create well_known_config view for public instance discovery
CREATE OR REPLACE VIEW well_known_config AS
SELECT 
    jsonb_build_object(
        'instance_name', (SELECT value FROM instance_config WHERE key = 'instance_name'),
        'instance_url', (SELECT value FROM instance_config WHERE key = 'instance_url'),
        'api_version', (SELECT value FROM instance_config WHERE key = 'api_version'),
        'api_endpoints', jsonb_build_object(
            'auth', '/api/v1/auth',
            'users', '/api/v1/users',
            'trades', '/api/v1/trades',
            'analytics', '/api/v1/analytics',
            'sync', '/api/v1/sync',
            'devices', '/api/v1/devices'
        ),
        'features', (SELECT value FROM instance_config WHERE key = 'features'),
        'mobile_config', (SELECT value FROM instance_config WHERE key = 'mobile_config')
    ) as config;

-- Add comment to document instance configuration
COMMENT ON TABLE instance_config IS 'Stores instance-specific configuration for cloud/self-hosted deployments';
COMMENT ON VIEW well_known_config IS 'Public view of instance configuration for mobile app discovery';