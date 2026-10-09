-- Persist journal AI analysis results so clients can recover after a gateway
-- closes the original long-running request.

CREATE TABLE IF NOT EXISTS diary_ai_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'processing'
        CHECK (status IN ('processing', 'completed', 'failed')),
    analysis TEXT,
    entries_analyzed INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT diary_ai_analyses_user_request_unique UNIQUE (user_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_diary_ai_analyses_user_created
    ON diary_ai_analyses(user_id, created_at DESC);
