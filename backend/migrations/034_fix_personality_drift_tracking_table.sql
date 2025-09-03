-- Fix missing updated_at column in personality_drift_tracking table
-- This column is being referenced in the personality analysis service but doesn't exist

ALTER TABLE personality_drift_tracking 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Update the comment
COMMENT ON COLUMN personality_drift_tracking.updated_at IS 'Timestamp when the drift analysis was last updated';