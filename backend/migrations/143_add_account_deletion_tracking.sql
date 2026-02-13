-- Migration: Add account deletion tracking for admin analytics
-- Tracks when users delete their accounts (self-deletion or admin deletion)

CREATE TABLE IF NOT EXISTS account_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_user_id UUID NOT NULL,  -- Original user ID (user no longer exists)
  deleted_username VARCHAR(50) NOT NULL,  -- Username at time of deletion
  deleted_email VARCHAR(255) NOT NULL,  -- Email at time of deletion
  deletion_type VARCHAR(20) NOT NULL,  -- 'self' or 'admin'
  deleted_by_admin_id UUID,  -- Admin who deleted (NULL if self-deletion)
  user_created_at TIMESTAMP,  -- When the deleted user originally signed up
  user_tier VARCHAR(20),  -- User's tier at deletion (free/pro)
  trade_count INTEGER DEFAULT 0,  -- Number of trades user had
  reason TEXT,  -- Optional reason (for future use)
  deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- Foreign key only for admin reference (deleted user won't exist)
  CONSTRAINT fk_deleted_by_admin FOREIGN KEY (deleted_by_admin_id)
    REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for analytics queries
CREATE INDEX idx_account_deletions_deleted_at ON account_deletions(deleted_at DESC);
CREATE INDEX idx_account_deletions_type ON account_deletions(deletion_type);
CREATE INDEX idx_account_deletions_tier ON account_deletions(user_tier);

-- Comments for documentation
COMMENT ON TABLE account_deletions IS 'Tracks account deletions for analytics and auditing';
COMMENT ON COLUMN account_deletions.deletion_type IS 'self = user deleted own account, admin = admin deleted account';
COMMENT ON COLUMN account_deletions.deleted_by_admin_id IS 'References admin who performed deletion, NULL for self-deletions';
