-- Create backup system tables for admin full-site backups
-- Supports automatic scheduled backups and manual backups

-- Backups table to store backup metadata and history
CREATE TABLE IF NOT EXISTS backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  filename VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT,
  backup_type VARCHAR(20) NOT NULL CHECK (backup_type IN ('manual', 'automatic')),
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- Backup settings table for configuration
CREATE TABLE IF NOT EXISTS backup_settings (
  id SERIAL PRIMARY KEY,
  enabled BOOLEAN DEFAULT FALSE,
  schedule VARCHAR(20) DEFAULT 'daily' CHECK (schedule IN ('hourly', 'daily', 'weekly', 'monthly')),
  retention_days INTEGER DEFAULT 30,
  last_backup TIMESTAMP WITH TIME ZONE,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert default backup settings
INSERT INTO backup_settings (enabled, schedule, retention_days)
VALUES (FALSE, 'daily', 30)
ON CONFLICT DO NOTHING;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_type ON backups(backup_type);
CREATE INDEX IF NOT EXISTS idx_backups_status ON backups(status);
CREATE INDEX IF NOT EXISTS idx_backups_user_id ON backups(user_id);

-- Grant permissions (adjust based on your user setup)
-- This assumes you have a 'trader' user
GRANT SELECT, INSERT, UPDATE, DELETE ON backups TO trader;
GRANT SELECT, UPDATE ON backup_settings TO trader;
GRANT USAGE, SELECT ON SEQUENCE backup_settings_id_seq TO trader;
