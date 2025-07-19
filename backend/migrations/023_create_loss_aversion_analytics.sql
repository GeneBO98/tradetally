-- Migration: Create loss aversion analytics tables
-- Track how quickly traders exit winners vs losers

-- Table for storing loss aversion events and metrics
CREATE TABLE IF NOT EXISTS loss_aversion_events (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Analysis period
  analysis_start_date DATE NOT NULL,
  analysis_end_date DATE NOT NULL,
  
  -- Core metrics
  avg_winner_hold_time_minutes INTEGER NOT NULL,
  avg_loser_hold_time_minutes INTEGER NOT NULL,
  hold_time_ratio DECIMAL(5,2) NOT NULL, -- losers/winners ratio
  
  -- Trade counts
  total_winning_trades INTEGER NOT NULL,
  total_losing_trades INTEGER NOT NULL,
  
  -- Early exit analysis
  premature_profit_exits INTEGER DEFAULT 0, -- Winners closed too early
  extended_loss_holds INTEGER DEFAULT 0, -- Losers held too long
  
  -- Financial impact
  estimated_monthly_cost DECIMAL(10,2) DEFAULT 0,
  missed_profit_potential DECIMAL(10,2) DEFAULT 0,
  unnecessary_loss_extension DECIMAL(10,2) DEFAULT 0,
  
  -- Risk/reward analysis
  avg_planned_risk_reward DECIMAL(5,2),
  avg_actual_risk_reward DECIMAL(5,2),
  
  -- Pattern details
  worst_hold_ratio_symbol VARCHAR(10),
  worst_hold_ratio_value DECIMAL(5,2),
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table for individual trade hold time analysis
CREATE TABLE IF NOT EXISTS trade_hold_patterns (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  
  -- Trade outcome
  is_winner BOOLEAN NOT NULL,
  pnl DECIMAL(10,2) NOT NULL,
  
  -- Hold times
  hold_time_minutes INTEGER NOT NULL,
  expected_hold_time_minutes INTEGER, -- Based on timeframe/strategy
  
  -- Exit analysis
  exit_reason VARCHAR(50), -- 'profit_target', 'stop_loss', 'manual', 'time_based'
  exit_quality_score DECIMAL(3,2), -- 0-1 score of exit timing quality
  
  -- Price movement analysis
  max_favorable_excursion DECIMAL(10,2), -- Best unrealized P&L
  max_adverse_excursion DECIMAL(10,2), -- Worst unrealized P&L
  exit_efficiency DECIMAL(3,2), -- How much of the move was captured
  
  -- Behavioral flags
  premature_exit BOOLEAN DEFAULT FALSE,
  extended_hold BOOLEAN DEFAULT FALSE,
  panic_exit BOOLEAN DEFAULT FALSE,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_loss_aversion_user_date ON loss_aversion_events(user_id, analysis_end_date DESC);
CREATE INDEX idx_trade_hold_patterns_user ON trade_hold_patterns(user_id);
CREATE INDEX idx_trade_hold_patterns_trade ON trade_hold_patterns(trade_id);
CREATE INDEX idx_trade_hold_patterns_outcome ON trade_hold_patterns(user_id, is_winner);

-- Add unique constraint to prevent duplicate trade analysis
CREATE UNIQUE INDEX idx_trade_hold_patterns_unique ON trade_hold_patterns(trade_id);

-- Add settings for loss aversion detection
ALTER TABLE behavioral_settings ADD COLUMN IF NOT EXISTS 
  loss_aversion_sensitivity VARCHAR(10) DEFAULT 'medium';

ALTER TABLE behavioral_settings ADD COLUMN IF NOT EXISTS
  min_trades_for_analysis INTEGER DEFAULT 20;

ALTER TABLE behavioral_settings ADD COLUMN IF NOT EXISTS
  normal_hold_ratio_threshold DECIMAL(3,2) DEFAULT 2.00; -- 2x is concerning

-- View for quick loss aversion summary
CREATE OR REPLACE VIEW loss_aversion_summary AS
SELECT 
  u.id as user_id,
  u.username,
  la.hold_time_ratio,
  la.avg_winner_hold_time_minutes,
  la.avg_loser_hold_time_minutes,
  la.estimated_monthly_cost,
  la.total_winning_trades + la.total_losing_trades as total_trades,
  la.analysis_end_date
FROM users u
LEFT JOIN loss_aversion_events la ON u.id = la.user_id
  AND la.analysis_end_date = (
    SELECT MAX(analysis_end_date) 
    FROM loss_aversion_events 
    WHERE user_id = u.id
  )
WHERE u.is_active = true;