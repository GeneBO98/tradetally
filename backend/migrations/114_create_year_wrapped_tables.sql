-- Year Wrapped Feature Tables
-- Tracks login history for streak calculation and caches year wrapped data

-- Login history for tracking daily logins and calculating login streaks
CREATE TABLE IF NOT EXISTS user_login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  login_date DATE NOT NULL,
  login_count INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, login_date)
);

CREATE INDEX IF NOT EXISTS idx_user_login_history_user_date ON user_login_history(user_id, login_date DESC);
CREATE INDEX IF NOT EXISTS idx_user_login_history_date ON user_login_history(login_date);

-- Year Wrapped data cache (generated annually, cached for performance)
CREATE TABLE IF NOT EXISTS year_wrapped_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  data JSONB NOT NULL,
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  viewed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(user_id, year)
);

CREATE INDEX IF NOT EXISTS idx_year_wrapped_user_year ON year_wrapped_data(user_id, year);

-- User preferences for year wrapped banner
CREATE TABLE IF NOT EXISTS year_wrapped_preferences (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  show_banner BOOLEAN DEFAULT true,
  last_dismissed_year INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add login streak fields to existing gamification stats table
ALTER TABLE user_gamification_stats
ADD COLUMN IF NOT EXISTS current_login_streak_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS longest_login_streak_days INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_login_streak_date DATE;

-- Backfill login history from last_login_at for existing users
INSERT INTO user_login_history (user_id, login_date, login_count)
SELECT id, DATE(last_login_at), 1
FROM users
WHERE last_login_at IS NOT NULL
ON CONFLICT (user_id, login_date) DO NOTHING;
