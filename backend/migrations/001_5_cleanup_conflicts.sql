-- Clean up any pre-existing indexes or constraints that might conflict with subsequent migrations
-- This migration runs before 002 and ensures a truly clean state

-- Drop any indexes that migration 002 will try to create
DROP INDEX IF EXISTS idx_devices_user_id;
DROP INDEX IF EXISTS idx_devices_fingerprint;
DROP INDEX IF EXISTS idx_devices_last_active;
DROP INDEX IF EXISTS idx_refresh_tokens_user_id;
DROP INDEX IF EXISTS idx_refresh_tokens_device_id;
DROP INDEX IF EXISTS idx_refresh_tokens_family_id;
DROP INDEX IF EXISTS idx_refresh_tokens_expires_at;
DROP INDEX IF EXISTS idx_sync_metadata_user_id;
DROP INDEX IF EXISTS idx_sync_metadata_entity;
DROP INDEX IF EXISTS idx_sync_metadata_sync_version;
DROP INDEX IF EXISTS idx_sync_metadata_created_at;
DROP INDEX IF EXISTS idx_api_keys_user_id;

-- Drop any tables that migration 002 will try to create
DROP TABLE IF EXISTS sync_metadata CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS devices CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;