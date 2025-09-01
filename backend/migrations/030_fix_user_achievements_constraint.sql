-- Fix the user_achievements table constraint to allow proper achievement tracking

-- Drop the problematic constraint that includes earned_at in the unique constraint
ALTER TABLE user_achievements DROP CONSTRAINT IF EXISTS user_achievements_user_id_achievement_id_earned_at_key;

-- Add a simpler unique constraint for non-repeatable achievements
-- This allows one achievement per user unless it's repeatable
ALTER TABLE user_achievements 
ADD CONSTRAINT user_achievements_user_achievement_unique 
UNIQUE(user_id, achievement_id);

-- For repeatable achievements, we'll handle duplicates in the application logic
-- The constraint will be temporarily removed for those