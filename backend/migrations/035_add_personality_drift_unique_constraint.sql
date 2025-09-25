-- Add missing unique constraint for personality_drift_tracking table
-- The trading personality service uses ON CONFLICT (user_id, analysis_date) which requires a unique constraint

CREATE UNIQUE INDEX IF NOT EXISTS idx_personality_drift_tracking_user_date_unique 
ON personality_drift_tracking(user_id, analysis_date);

-- Update comment
COMMENT ON INDEX idx_personality_drift_tracking_user_date_unique IS 'Unique constraint for personality drift tracking - one analysis per user per date';