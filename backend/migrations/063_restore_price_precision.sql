-- Restore decimal precision to support 6 decimal places for price fields
-- This re-applies the precision that was previously reverted, to support more granular trading
-- Common use cases: crypto trading, forex, penny stocks, options

-- First, drop the view that depends on these columns
DROP VIEW IF EXISTS trades_with_health_analytics CASCADE;

-- Now alter the columns
ALTER TABLE trades
ALTER COLUMN entry_price TYPE DECIMAL(15, 6),
ALTER COLUMN exit_price TYPE DECIMAL(15, 6),
ALTER COLUMN commission TYPE DECIMAL(15, 6),
ALTER COLUMN fees TYPE DECIMAL(15, 6),
ALTER COLUMN mae TYPE DECIMAL(15, 6),
ALTER COLUMN mfe TYPE DECIMAL(15, 6);

-- Recreate the view with the same definition
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
        WHEN t.stress_level <= 0.8 THEN 'high'
        WHEN t.stress_level IS NOT NULL THEN 'very_high'
        ELSE 'unknown'
    END as stress_category
FROM trades t;

-- Update comments for clarity
COMMENT ON COLUMN trades.entry_price IS 'Entry price with up to 6 decimal places for high precision trading';
COMMENT ON COLUMN trades.exit_price IS 'Exit price with up to 6 decimal places for high precision trading';
COMMENT ON COLUMN trades.commission IS 'Commission paid with up to 6 decimal places';
COMMENT ON COLUMN trades.fees IS 'Additional fees with up to 6 decimal places';
COMMENT ON COLUMN trades.mae IS 'Maximum Adverse Excursion with up to 6 decimal places';
COMMENT ON COLUMN trades.mfe IS 'Maximum Favorable Excursion with up to 6 decimal places';
COMMENT ON VIEW trades_with_health_analytics IS 'Enhanced trades view with health metric categorization';