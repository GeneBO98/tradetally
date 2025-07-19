-- Migration: Create trading personality profiling tables
-- Track trader personalities, behavioral drift, and peer comparisons

-- Table for storing trading personality profiles
CREATE TABLE IF NOT EXISTS trading_personality_profiles (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Primary personality classification
  primary_personality VARCHAR(20) NOT NULL, -- 'scalper', 'momentum', 'mean_reversion', 'swing', 'hybrid'
  personality_confidence DECIMAL(3,2) NOT NULL, -- 0.0 - 1.0 confidence score
  
  -- Personality characteristics scores (0-100)
  scalper_score INTEGER DEFAULT 0,
  momentum_score INTEGER DEFAULT 0,
  mean_reversion_score INTEGER DEFAULT 0,
  swing_score INTEGER DEFAULT 0,
  
  -- Trading behavior metrics
  avg_hold_time_minutes INTEGER NOT NULL,
  avg_trade_frequency_per_day DECIMAL(5,2) DEFAULT 0,
  preferred_timeframes JSONB, -- ['1m', '5m', '15m', '1h', '4h', 'D']
  
  -- Technical analysis preferences (based on actual usage)
  uses_momentum_indicators BOOLEAN DEFAULT FALSE,
  uses_mean_reversion_indicators BOOLEAN DEFAULT FALSE,
  uses_volume_analysis BOOLEAN DEFAULT FALSE,
  uses_pattern_recognition BOOLEAN DEFAULT FALSE,
  
  -- Risk characteristics
  risk_tolerance VARCHAR(10) DEFAULT 'medium', -- 'low', 'medium', 'high'
  position_sizing_consistency DECIMAL(3,2) DEFAULT 0, -- How consistent position sizes are
  stop_loss_discipline DECIMAL(3,2) DEFAULT 0, -- How often stops are honored
  
  -- Performance alignment with personality
  personality_performance_score DECIMAL(3,2) DEFAULT 0, -- How well performance matches expected personality
  optimal_strategy_adherence DECIMAL(3,2) DEFAULT 0, -- How closely following optimal strategy for personality
  
  -- Analysis metadata
  total_trades_analyzed INTEGER NOT NULL,
  analysis_start_date DATE NOT NULL,
  analysis_end_date DATE NOT NULL,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for tracking behavioral drift over time
CREATE TABLE IF NOT EXISTS personality_drift_tracking (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Time period for this drift analysis
  analysis_date DATE NOT NULL,
  period_days INTEGER DEFAULT 30, -- Analysis period (e.g., 30 days)
  
  -- Previous vs current personality scores
  previous_primary_personality VARCHAR(20),
  current_primary_personality VARCHAR(20),
  personality_drift_score DECIMAL(3,2) DEFAULT 0, -- How much personality has drifted
  
  -- Specific behavioral changes
  hold_time_drift_percent DECIMAL(5,2) DEFAULT 0, -- Change in average hold time
  frequency_drift_percent DECIMAL(5,2) DEFAULT 0, -- Change in trading frequency
  risk_tolerance_drift DECIMAL(3,2) DEFAULT 0, -- Change in risk-taking behavior
  
  -- Performance impact of drift
  drift_performance_impact DECIMAL(10,2) DEFAULT 0, -- $ impact of drift from optimal
  
  -- Drift alerts and recommendations
  drift_severity VARCHAR(10) DEFAULT 'low', -- 'low', 'medium', 'high'
  drift_recommendations JSONB, -- Array of specific recommendations
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for peer comparison data
CREATE TABLE IF NOT EXISTS personality_peer_comparison (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Peer group definition
  personality_type VARCHAR(20) NOT NULL,
  peer_group_size INTEGER DEFAULT 0,
  
  -- User vs peer metrics
  user_avg_return DECIMAL(5,2) DEFAULT 0,
  peer_avg_return DECIMAL(5,2) DEFAULT 0,
  user_sharpe_ratio DECIMAL(4,3) DEFAULT 0,
  peer_avg_sharpe_ratio DECIMAL(4,3) DEFAULT 0,
  user_win_rate DECIMAL(3,2) DEFAULT 0,
  peer_avg_win_rate DECIMAL(3,2) DEFAULT 0,
  
  -- Ranking within personality group
  return_percentile INTEGER DEFAULT 50, -- User's percentile ranking in returns
  consistency_percentile INTEGER DEFAULT 50, -- User's percentile ranking in consistency
  risk_management_percentile INTEGER DEFAULT 50, -- User's percentile ranking in risk management
  
  -- Best practices from top performers
  top_performer_characteristics JSONB, -- What top 10% of this personality do differently
  improvement_suggestions JSONB, -- Specific suggestions based on peer analysis
  
  -- Analysis metadata
  comparison_date DATE NOT NULL,
  peer_data_quality DECIMAL(3,2) DEFAULT 0, -- Quality/reliability of peer data
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for personality-specific trade analysis
CREATE TABLE IF NOT EXISTS personality_trade_analysis (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  
  -- Personality alignment analysis
  personality_alignment_score DECIMAL(3,2) DEFAULT 0, -- How well trade fits user's personality
  optimal_personality_for_trade VARCHAR(20), -- Which personality would be best for this trade
  
  -- Technical setup analysis
  setup_quality VARCHAR(10), -- 'poor', 'fair', 'good', 'excellent'
  pattern_match_score DECIMAL(3,2) DEFAULT 0, -- How well trade matches expected patterns
  
  -- Timing analysis
  entry_timing_quality VARCHAR(10), -- Quality of entry timing
  exit_timing_quality VARCHAR(10), -- Quality of exit timing
  hold_time_appropriateness VARCHAR(10), -- 'too_short', 'appropriate', 'too_long'
  
  -- Market conditions compatibility
  market_regime VARCHAR(20), -- 'trending', 'range_bound', 'volatile', 'low_vol'
  personality_market_fit DECIMAL(3,2) DEFAULT 0, -- How well personality fits market conditions
  
  -- Recommendations
  trade_specific_recommendations JSONB,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_personality_profiles_user ON trading_personality_profiles(user_id);
CREATE INDEX idx_personality_drift_user_date ON personality_drift_tracking(user_id, analysis_date DESC);
CREATE INDEX idx_peer_comparison_user_type ON personality_peer_comparison(user_id, personality_type);
CREATE INDEX idx_trade_analysis_user ON personality_trade_analysis(user_id);
CREATE INDEX idx_trade_analysis_trade ON personality_trade_analysis(trade_id);

-- Add unique constraints
CREATE UNIQUE INDEX idx_personality_profiles_user_unique ON trading_personality_profiles(user_id, analysis_end_date);
CREATE UNIQUE INDEX idx_trade_analysis_unique ON personality_trade_analysis(trade_id);

-- Add settings for personality profiling
ALTER TABLE behavioral_settings ADD COLUMN IF NOT EXISTS 
  personality_profiling_enabled BOOLEAN DEFAULT TRUE;

ALTER TABLE behavioral_settings ADD COLUMN IF NOT EXISTS
  personality_drift_sensitivity VARCHAR(10) DEFAULT 'medium';

ALTER TABLE behavioral_settings ADD COLUMN IF NOT EXISTS
  peer_comparison_enabled BOOLEAN DEFAULT TRUE;

-- View for quick personality summary
CREATE OR REPLACE VIEW personality_summary AS
SELECT 
  u.id as user_id,
  u.username,
  tpp.primary_personality,
  tpp.personality_confidence,
  tpp.avg_hold_time_minutes,
  tpp.avg_trade_frequency_per_day,
  tpp.personality_performance_score,
  tpp.optimal_strategy_adherence,
  pdt.drift_severity,
  pdt.personality_drift_score,
  ppc.return_percentile,
  ppc.peer_avg_return,
  tpp.analysis_end_date
FROM users u
LEFT JOIN trading_personality_profiles tpp ON u.id = tpp.user_id
  AND tpp.analysis_end_date = (
    SELECT MAX(analysis_end_date) 
    FROM trading_personality_profiles 
    WHERE user_id = u.id
  )
LEFT JOIN personality_drift_tracking pdt ON u.id = pdt.user_id
  AND pdt.analysis_date = (
    SELECT MAX(analysis_date)
    FROM personality_drift_tracking
    WHERE user_id = u.id
  )
LEFT JOIN personality_peer_comparison ppc ON u.id = ppc.user_id
  AND ppc.comparison_date = (
    SELECT MAX(comparison_date)
    FROM personality_peer_comparison
    WHERE user_id = u.id
  )
WHERE u.is_active = true;