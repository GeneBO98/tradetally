-- Migration: Create job queue system for background processing
-- This enables fast imports by deferring slow API calls to background jobs

CREATE TABLE IF NOT EXISTS job_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL,
    data JSONB NOT NULL,
    priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    result JSONB,
    error TEXT
);

-- Indexes for efficient job processing
CREATE INDEX IF NOT EXISTS idx_job_queue_status_priority ON job_queue(status, priority, created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_job_queue_user_id ON job_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_job_queue_type ON job_queue(type);
CREATE INDEX IF NOT EXISTS idx_job_queue_created_at ON job_queue(created_at);

-- Add enrichment status to trades table to track background processing
ALTER TABLE trades ADD COLUMN IF NOT EXISTS enrichment_status VARCHAR(20) DEFAULT 'pending' CHECK (enrichment_status IN ('pending', 'processing', 'completed', 'failed'));
ALTER TABLE trades ADD COLUMN IF NOT EXISTS enrichment_completed_at TIMESTAMP WITH TIME ZONE;

-- Index for enrichment status
CREATE INDEX IF NOT EXISTS idx_trades_enrichment_status ON trades(enrichment_status) WHERE enrichment_status != 'completed';