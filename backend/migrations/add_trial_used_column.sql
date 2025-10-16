-- Add trial_used column to users table if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_used BOOLEAN DEFAULT FALSE;

-- Create function to handle tier_override deletions
CREATE OR REPLACE FUNCTION reset_trial_used_on_delete()
RETURNS TRIGGER AS $$
BEGIN
    -- If the deleted override was a trial, reset the trial_used flag
    IF OLD.reason ILIKE '%trial%' THEN
        UPDATE users 
        SET trial_used = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.user_id;
        
        RAISE NOTICE 'Reset trial_used flag for user % after deleting trial override', OLD.user_id;
    END IF;
    
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create function to handle tier_override insertions
CREATE OR REPLACE FUNCTION set_trial_used_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- If the new override is a trial, set the trial_used flag
    IF NEW.reason ILIKE '%trial%' THEN
        UPDATE users 
        SET trial_used = true, updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.user_id;
        
        RAISE NOTICE 'Set trial_used flag for user % after creating trial override', NEW.user_id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS tier_override_delete_trigger ON tier_overrides;
CREATE TRIGGER tier_override_delete_trigger
    AFTER DELETE ON tier_overrides
    FOR EACH ROW
    EXECUTE FUNCTION reset_trial_used_on_delete();

DROP TRIGGER IF EXISTS tier_override_insert_trigger ON tier_overrides;
CREATE TRIGGER tier_override_insert_trigger
    AFTER INSERT ON tier_overrides
    FOR EACH ROW
    EXECUTE FUNCTION set_trial_used_on_insert();

-- Sync existing data
UPDATE users u
SET trial_used = EXISTS (
    SELECT 1 FROM tier_overrides to_
    WHERE to_.user_id = u.id
    AND to_.reason ILIKE '%trial%'
),
updated_at = CURRENT_TIMESTAMP;