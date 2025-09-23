-- Add Health Metrics to Trades Table
-- Adds health-related columns to correlate with trading performance

-- Add health metric columns to existing trades table
ALTER TABLE trades ADD COLUMN IF NOT EXISTS heart_rate DECIMAL(5,2); -- Average heart rate around trade time
ALTER TABLE trades ADD COLUMN IF NOT EXISTS sleep_score DECIMAL(5,2); -- Sleep quality score (0-100)
ALTER TABLE trades ADD COLUMN IF NOT EXISTS sleep_hours DECIMAL(4,2); -- Total sleep hours for trade date
ALTER TABLE trades ADD COLUMN IF NOT EXISTS stress_level DECIMAL(3,2); -- Calculated stress level (0-1)

-- Create indexes for health data queries
CREATE INDEX IF NOT EXISTS idx_trades_heart_rate ON trades(heart_rate) WHERE heart_rate IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_sleep_score ON trades(sleep_score) WHERE sleep_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_trades_health_metrics ON trades(heart_rate, sleep_score, stress_level) WHERE heart_rate IS NOT NULL OR sleep_score IS NOT NULL;

-- Create a view for trades with health analytics
CREATE OR REPLACE VIEW trades_with_health_analytics AS
SELECT 
    t.*,
    CASE 
        WHEN t.pnl > 0 THEN 'profitable'
        WHEN t.pnl < 0 THEN 'losing'
        ELSE 'breakeven'
    END as trade_outcome,
    -- Health quality indicators
    CASE
        WHEN t.sleep_score >= 80 THEN 'excellent'
        WHEN t.sleep_score >= 65 THEN 'good'
        WHEN t.sleep_score >= 50 THEN 'fair'
        WHEN t.sleep_score IS NOT NULL THEN 'poor'
        ELSE 'unknown'
    END as sleep_quality_category,
    CASE
        WHEN t.heart_rate BETWEEN 60 AND 80 THEN 'normal'
        WHEN t.heart_rate > 80 THEN 'elevated'
        WHEN t.heart_rate < 60 THEN 'low'
        ELSE 'unknown'
    END as heart_rate_category,
    CASE
        WHEN t.stress_level <= 0.3 THEN 'low'
        WHEN t.stress_level <= 0.6 THEN 'moderate'
        WHEN t.stress_level IS NOT NULL THEN 'high'
        ELSE 'unknown'
    END as stress_category
FROM trades t;

-- Create materialized view for health correlation analytics (for performance)
CREATE MATERIALIZED VIEW IF NOT EXISTS health_trade_correlations AS
SELECT 
    user_id,
    trade_outcome,
    COUNT(*) as trade_count,
    -- Heart Rate Analytics
    AVG(heart_rate) as avg_heart_rate,
    STDDEV(heart_rate) as stddev_heart_rate,
    -- Sleep Analytics  
    AVG(sleep_score) as avg_sleep_score,
    AVG(sleep_hours) as avg_sleep_hours,
    STDDEV(sleep_score) as stddev_sleep_score,
    -- Stress Analytics
    AVG(stress_level) as avg_stress_level,
    STDDEV(stress_level) as stddev_stress_level,
    -- Performance Analytics
    AVG(pnl) as avg_pnl,
    SUM(pnl) as total_pnl,
    COUNT(*) FILTER (WHERE pnl > 0) as winning_trades,
    COUNT(*) FILTER (WHERE pnl < 0) as losing_trades,
    CASE 
        WHEN COUNT(*) > 0 THEN 
            (COUNT(*) FILTER (WHERE pnl > 0)::FLOAT / COUNT(*) * 100)
        ELSE 0 
    END as win_rate
FROM trades_with_health_analytics
WHERE heart_rate IS NOT NULL OR sleep_score IS NOT NULL OR stress_level IS NOT NULL
GROUP BY user_id, trade_outcome;

-- Create function to refresh health correlations
CREATE OR REPLACE FUNCTION refresh_health_correlations()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW health_trade_correlations;
END;
$$ LANGUAGE plpgsql;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_correlations_user_outcome 
ON health_trade_correlations(user_id, trade_outcome);

-- Add comments for documentation
COMMENT ON COLUMN trades.heart_rate IS 'Average heart rate (BPM) around trade execution time';
COMMENT ON COLUMN trades.sleep_score IS 'Sleep quality score (0-100) for the trade date';
COMMENT ON COLUMN trades.sleep_hours IS 'Total sleep hours for the night before trade date';
COMMENT ON COLUMN trades.stress_level IS 'Calculated stress level (0-1) based on heart rate and sleep';

COMMENT ON VIEW trades_with_health_analytics IS 'Enhanced trades view with health metric categorization';
COMMENT ON MATERIALIZED VIEW health_trade_correlations IS 'Aggregated health-trade performance correlations by user and outcome';