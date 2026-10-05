-- Track when a full (unfiltered) revenge analysis last ran for a user.
-- The no-revenge achievements only count a window that analysis has covered,
-- instead of treating "no recorded events" as clean.
ALTER TABLE user_gamification_stats
  ADD COLUMN IF NOT EXISTS revenge_analysis_at TIMESTAMP WITH TIME ZONE;
