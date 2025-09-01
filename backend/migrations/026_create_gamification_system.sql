-- Create achievement categories
CREATE TYPE achievement_category AS ENUM (
  'behavioral',
  'performance', 
  'learning',
  'social',
  'milestone'
);

-- Create achievement difficulty levels
CREATE TYPE achievement_difficulty AS ENUM (
  'bronze',
  'silver',
  'gold',
  'platinum'
);

-- Create challenge status
CREATE TYPE challenge_status AS ENUM (
  'active',
  'completed',
  'failed',
  'expired'
);

-- Achievements master table
CREATE TABLE achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL, -- Unique identifier like 'revenge_free_week'
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category achievement_category NOT NULL,
  difficulty achievement_difficulty NOT NULL,
  points INTEGER NOT NULL DEFAULT 10,
  icon_name VARCHAR(100), -- Icon identifier for frontend
  criteria JSONB NOT NULL, -- Criteria configuration
  is_active BOOLEAN DEFAULT true,
  is_repeatable BOOLEAN DEFAULT false,
  max_progress INTEGER DEFAULT 1, -- For progress-based achievements
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User achievements tracking
CREATE TABLE user_achievements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  earned_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  progress INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}', -- Additional data about how it was earned
  UNIQUE(user_id, achievement_id, earned_at) -- Allow repeatable achievements
);

-- Behavioral challenges
CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  category achievement_category NOT NULL,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  criteria JSONB NOT NULL, -- Challenge requirements
  reward_points INTEGER NOT NULL DEFAULT 50,
  reward_achievement_id UUID REFERENCES achievements(id),
  is_community BOOLEAN DEFAULT false, -- Community-wide vs individual
  target_value NUMERIC, -- For measurable goals
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User challenge participation
CREATE TABLE user_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  status challenge_status NOT NULL DEFAULT 'active',
  progress NUMERIC DEFAULT 0,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  UNIQUE(user_id, challenge_id)
);

-- Leaderboards
CREATE TABLE leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  metric_key VARCHAR(100) NOT NULL, -- What metric to track
  period_type VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly', 'all_time'
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE,
  min_participants INTEGER DEFAULT 10, -- Minimum for public display
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Leaderboard entries
CREATE TABLE leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leaderboard_id UUID NOT NULL REFERENCES leaderboards(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anonymous_name VARCHAR(100), -- Anonymous display name
  score NUMERIC NOT NULL,
  rank INTEGER,
  metadata JSONB DEFAULT '{}',
  recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(leaderboard_id, user_id, recorded_at)
);

-- Privacy settings for gamification
CREATE TABLE gamification_privacy (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  show_on_leaderboards BOOLEAN DEFAULT true,
  anonymous_only BOOLEAN DEFAULT false,
  share_achievements BOOLEAN DEFAULT true,
  participate_in_challenges BOOLEAN DEFAULT true,
  share_with_peer_group BOOLEAN DEFAULT true,
  visible_metrics JSONB DEFAULT '["discipline_score", "consistency_score"]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User stats for gamification
CREATE TABLE user_gamification_stats (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  total_points INTEGER DEFAULT 0,
  achievement_count INTEGER DEFAULT 0,
  challenge_count INTEGER DEFAULT 0,
  current_streak_days INTEGER DEFAULT 0,
  longest_streak_days INTEGER DEFAULT 0,
  last_achievement_date TIMESTAMP WITH TIME ZONE,
  level INTEGER DEFAULT 1,
  experience_points INTEGER DEFAULT 0,
  badges JSONB DEFAULT '[]',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Peer comparison groups
CREATE TABLE peer_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  criteria JSONB NOT NULL, -- Matching criteria
  min_members INTEGER DEFAULT 10,
  max_members INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- User peer group membership
CREATE TABLE user_peer_groups (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peer_group_id UUID NOT NULL REFERENCES peer_groups(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true,
  PRIMARY KEY (user_id, peer_group_id)
);

-- Achievement milestones (for tracking progress)
CREATE TABLE achievement_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievements(id),
  milestone_key VARCHAR(100) NOT NULL,
  achieved_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  value NUMERIC,
  metadata JSONB DEFAULT '{}'
);

-- Create indexes for performance
CREATE INDEX idx_user_achievements_user_id ON user_achievements(user_id);
CREATE INDEX idx_user_achievements_earned_at ON user_achievements(earned_at);
CREATE INDEX idx_user_challenges_user_status ON user_challenges(user_id, status);
CREATE INDEX idx_leaderboard_entries_board_rank ON leaderboard_entries(leaderboard_id, rank);
CREATE INDEX idx_leaderboard_entries_user ON leaderboard_entries(user_id);
CREATE INDEX idx_achievement_milestones_user ON achievement_milestones(user_id);
CREATE INDEX idx_user_peer_groups_user ON user_peer_groups(user_id);

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_achievements_updated_at
  BEFORE UPDATE ON achievements
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_gamification_privacy_updated_at
  BEFORE UPDATE ON gamification_privacy
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_user_gamification_stats_updated_at
  BEFORE UPDATE ON user_gamification_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Insert default achievements
INSERT INTO achievements (key, name, description, category, difficulty, points, criteria) VALUES
-- Behavioral achievements
('revenge_free_week', 'Revenge Trading Free Week', 'Go 7 days without any revenge trading incidents', 'behavioral', 'bronze', 50, '{"type": "no_revenge_trades", "days": 7}'),
('revenge_free_month', 'Revenge Trading Free Month', 'Go 30 days without any revenge trading incidents', 'behavioral', 'silver', 200, '{"type": "no_revenge_trades", "days": 30}'),
('discipline_master', 'Discipline Master', 'Maintain discipline score above 90% for 30 days', 'behavioral', 'gold', 500, '{"type": "discipline_score", "threshold": 90, "days": 30}'),
('risk_manager', 'Risk Manager', 'Keep all trades within risk limits for 100 trades', 'behavioral', 'silver', 150, '{"type": "risk_adherence", "trades": 100}'),
('cool_head', 'Cool Head', 'Use cooling period after 90% of losses', 'behavioral', 'bronze', 75, '{"type": "cooling_period_usage", "percentage": 90}'),

-- Performance achievements
('profitable_week', 'Profitable Week', 'End the week with positive P&L', 'performance', 'bronze', 30, '{"type": "weekly_pnl", "positive": true}'),
('consistent_trader', 'Consistent Trader', 'Maintain win rate above 50% for 50 trades', 'performance', 'silver', 100, '{"type": "win_rate", "threshold": 50, "trades": 50}'),
('risk_reward_master', 'Risk Reward Master', 'Achieve 2:1 risk/reward ratio on 20 trades', 'performance', 'gold', 300, '{"type": "risk_reward", "ratio": 2, "trades": 20}'),

-- Learning achievements
('pattern_spotter', 'Pattern Spotter', 'Identify and document 10 behavioral patterns', 'learning', 'bronze', 40, '{"type": "patterns_identified", "count": 10}'),
('improvement_focused', 'Improvement Focused', 'Complete 5 behavioral challenges', 'learning', 'silver', 150, '{"type": "challenges_completed", "count": 5}'),

-- Social achievements
('peer_mentor', 'Peer Mentor', 'Rank in top 10% of your peer group', 'social', 'gold', 400, '{"type": "peer_rank", "percentile": 90}'),
('community_contributor', 'Community Contributor', 'Participate in 3 community challenges', 'social', 'bronze', 60, '{"type": "community_challenges", "count": 3}'),

-- Milestone achievements
('first_trade_logged', 'First Trade', 'Log your first trade', 'milestone', 'bronze', 10, '{"type": "trade_count", "count": 1}'),
('century_trader', 'Century Trader', 'Log 100 trades', 'milestone', 'silver', 100, '{"type": "trade_count", "count": 100}'),
('veteran_trader', 'Veteran Trader', 'Log 1000 trades', 'milestone', 'gold', 500, '{"type": "trade_count", "count": 1000}');

-- Insert default leaderboards
INSERT INTO leaderboards (key, name, description, metric_key, period_type) VALUES
('discipline_weekly', 'Weekly Discipline Leaders', 'Traders with the best discipline scores this week', 'discipline_score', 'weekly'),
('discipline_monthly', 'Monthly Discipline Leaders', 'Traders with the best discipline scores this month', 'discipline_score', 'monthly'),
('revenge_free_alltime', 'Revenge Trading Free Leaders', 'Traders with longest revenge-free streaks', 'revenge_free_days', 'all_time'),
('consistency_monthly', 'Consistency Champions', 'Most consistent traders this month', 'consistency_score', 'monthly'),
('risk_management_weekly', 'Risk Management Masters', 'Best risk adherence this week', 'risk_adherence_score', 'weekly');

-- Create function to anonymize user display names
CREATE OR REPLACE FUNCTION generate_anonymous_name(user_id UUID)
RETURNS VARCHAR(100) AS $$
DECLARE
  adjectives TEXT[] := ARRAY['Swift', 'Clever', 'Steady', 'Wise', 'Bold', 'Calm', 'Sharp', 'Keen', 'Brave', 'Smart'];
  nouns TEXT[] := ARRAY['Trader', 'Analyst', 'Investor', 'Strategist', 'Bull', 'Bear', 'Eagle', 'Wolf', 'Fox', 'Hawk'];
  hash_value INTEGER;
BEGIN
  -- Generate a consistent hash from user_id
  hash_value := abs(hashtext(user_id::text));
  
  -- Use hash to select adjective and noun
  RETURN adjectives[(hash_value % array_length(adjectives, 1)) + 1] || ' ' || 
         nouns[((hash_value / 10) % array_length(nouns, 1)) + 1] || ' ' ||
         (hash_value % 1000)::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;