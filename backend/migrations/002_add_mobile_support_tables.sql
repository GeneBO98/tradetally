-- Migration: Add mobile support tables
-- This migration adds support for mobile applications including:
-- - Device tracking and management
-- - Refresh token support
-- - Sync metadata for offline capabilities

-- Create devices table for tracking user devices
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(255) NOT NULL,
    device_type VARCHAR(50) CHECK (device_type IN ('ios', 'android', 'web', 'desktop')),
    device_model VARCHAR(255),
    device_fingerprint VARCHAR(255),
    platform_version VARCHAR(50),
    app_version VARCHAR(50),
    last_active TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_trusted BOOLEAN DEFAULT FALSE,
    push_token VARCHAR(500),
    push_platform VARCHAR(50) CHECK (push_platform IN ('fcm', 'apns', NULL)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create refresh_tokens table for long-lived authentication
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    family_id UUID NOT NULL, -- For refresh token rotation tracking
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoked_reason VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP WITH TIME ZONE
);

-- Create sync_metadata table for tracking data changes
CREATE TABLE IF NOT EXISTS sync_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('trade', 'journal', 'settings', 'user_profile')),
    entity_id UUID NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('create', 'update', 'delete')),
    sync_version BIGSERIAL,
    change_data JSONB, -- Store the actual changes for conflict resolution
    device_id UUID REFERENCES devices(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create api_keys table for programmatic access (future use)
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) UNIQUE NOT NULL,
    permissions JSONB DEFAULT '["read"]'::jsonb,
    last_used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP WITH TIME ZONE
);

-- Add indexes for performance (with IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
CREATE INDEX IF NOT EXISTS idx_devices_fingerprint ON devices(device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_devices_last_active ON devices(last_active);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_device_id ON refresh_tokens(device_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family_id ON refresh_tokens(family_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_sync_metadata_user_id ON sync_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_metadata_entity ON sync_metadata(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_metadata_sync_version ON sync_metadata(user_id, sync_version);
CREATE INDEX IF NOT EXISTS idx_sync_metadata_created_at ON sync_metadata(created_at);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);

-- Add updated_at timestamp to existing tables if not exists
DO $$ 
BEGIN
    -- Add updated_at to trades table if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'trades' AND column_name = 'updated_at') THEN
        ALTER TABLE trades ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    -- Add updated_at to trade_journal_entries table if it exists and doesn't have the column
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trade_journal_entries') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns 
                      WHERE table_name = 'trade_journal_entries' AND column_name = 'updated_at') THEN
        ALTER TABLE trade_journal_entries ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at on all relevant tables (only if they don't exist)
DO $$ 
BEGIN
    -- Create users trigger if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_users_updated_at' AND event_object_table = 'users') THEN
        EXECUTE 'CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
    
    -- Create trades trigger if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_trades_updated_at' AND event_object_table = 'trades') THEN
        EXECUTE 'CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
END $$;

-- Only create trigger if table exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trade_journal_entries') THEN
        EXECUTE 'CREATE TRIGGER update_trade_journal_entries_updated_at BEFORE UPDATE ON trade_journal_entries FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
END $$;

-- Create devices trigger
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.triggers 
                   WHERE trigger_name = 'update_devices_updated_at' AND event_object_table = 'devices') THEN
        EXECUTE 'CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()';
    END IF;
END $$;

-- Create function to track changes for sync
CREATE OR REPLACE FUNCTION track_sync_changes()
RETURNS TRIGGER AS $$
DECLARE
    v_entity_type VARCHAR(50);
    v_action VARCHAR(20);
    v_entity_id UUID;
    v_user_id UUID;
    v_change_data JSONB;
BEGIN
    -- Determine entity type based on TG_TABLE_NAME
    CASE TG_TABLE_NAME
        WHEN 'trades' THEN v_entity_type := 'trade';
        WHEN 'trade_journal_entries' THEN v_entity_type := 'journal';
        WHEN 'user_settings' THEN v_entity_type := 'settings';
        WHEN 'users' THEN v_entity_type := 'user_profile';
        ELSE RETURN NEW; -- Skip unknown tables
    END CASE;
    
    -- Determine action
    CASE TG_OP
        WHEN 'INSERT' THEN 
            v_action := 'create';
            v_entity_id := NEW.id;
            v_user_id := COALESCE(NEW.user_id, NEW.id); -- For users table, use id as user_id
            v_change_data := to_jsonb(NEW);
        WHEN 'UPDATE' THEN 
            v_action := 'update';
            v_entity_id := NEW.id;
            v_user_id := COALESCE(NEW.user_id, NEW.id);
            -- Store only changed fields
            v_change_data := jsonb_build_object(
                'old', to_jsonb(OLD),
                'new', to_jsonb(NEW)
            );
        WHEN 'DELETE' THEN 
            v_action := 'delete';
            v_entity_id := OLD.id;
            v_user_id := COALESCE(OLD.user_id, OLD.id);
            v_change_data := to_jsonb(OLD);
    END CASE;
    
    -- Insert sync metadata
    INSERT INTO sync_metadata (user_id, entity_type, entity_id, action, change_data)
    VALUES (v_user_id, v_entity_type, v_entity_id, v_action, v_change_data);
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ language 'plpgsql';

-- Create triggers for sync tracking (can be enabled/disabled as needed)
-- These are commented out by default to avoid performance impact until mobile sync is needed
-- UNCOMMENT these when ready to enable sync tracking:
/*
CREATE TRIGGER track_trades_sync AFTER INSERT OR UPDATE OR DELETE ON trades 
    FOR EACH ROW EXECUTE FUNCTION track_sync_changes();

CREATE TRIGGER track_journal_sync AFTER INSERT OR UPDATE OR DELETE ON trade_journal_entries 
    FOR EACH ROW EXECUTE FUNCTION track_sync_changes();

CREATE TRIGGER track_settings_sync AFTER INSERT OR UPDATE OR DELETE ON user_settings 
    FOR EACH ROW EXECUTE FUNCTION track_sync_changes();

CREATE TRIGGER track_user_profile_sync AFTER UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION track_sync_changes();
*/

-- Add comment to document mobile support
COMMENT ON TABLE devices IS 'Tracks user devices for mobile app support and multi-device management';
COMMENT ON TABLE refresh_tokens IS 'Long-lived refresh tokens for mobile app authentication';
COMMENT ON TABLE sync_metadata IS 'Tracks data changes for mobile offline sync capabilities';
COMMENT ON TABLE api_keys IS 'API keys for programmatic access (future mobile SDK support)';