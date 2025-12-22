-- Migration: Increase commission and fees precision
-- Some brokers report commissions with more decimal places than currently supported

-- First, drop views that depend on these columns (CASCADE to handle dependencies)
DROP MATERIALIZED VIEW IF EXISTS health_trade_correlations CASCADE;
DROP VIEW IF EXISTS trades_with_health_analytics CASCADE;

-- Increase precision for commission fields
ALTER TABLE trades
ALTER COLUMN commission TYPE DECIMAL(20, 8),
ALTER COLUMN fees TYPE DECIMAL(20, 8),
ALTER COLUMN entry_commission TYPE DECIMAL(20, 8),
ALTER COLUMN exit_commission TYPE DECIMAL(20, 8);

-- Update comments
COMMENT ON COLUMN trades.commission IS 'Commission paid with up to 8 decimal places for precision';
COMMENT ON COLUMN trades.fees IS 'Additional fees with up to 8 decimal places for precision';
COMMENT ON COLUMN trades.entry_commission IS 'Entry commission with up to 8 decimal places';
COMMENT ON COLUMN trades.exit_commission IS 'Exit commission with up to 8 decimal places';

-- Recreate the view
CREATE OR REPLACE VIEW trades_with_health_analytics AS
SELECT
    id,
    user_id,
    symbol,
    trade_date,
    entry_time,
    exit_time,
    entry_price,
    exit_price,
    quantity,
    side,
    commission,
    fees,
    pnl,
    pnl_percent,
    notes,
    is_public,
    broker,
    strategy,
    setup,
    tags,
    created_at,
    updated_at,
    executions,
    mae,
    mfe,
    split_adjusted,
    original_quantity,
    original_entry_price,
    original_exit_price,
    classification_method,
    strategy_confidence,
    classification_metadata,
    manual_override,
    confidence,
    enrichment_status,
    enrichment_completed_at,
    round_trip_id,
    news_events,
    has_news,
    news_sentiment,
    news_checked_at,
    instrument_type,
    strike_price,
    expiration_date,
    option_type,
    contract_size,
    underlying_symbol,
    contract_month,
    contract_year,
    tick_size,
    point_value,
    underlying_asset,
    import_id,
    original_currency,
    exchange_rate,
    original_entry_price_currency,
    original_exit_price_currency,
    original_pnl_currency,
    original_commission_currency,
    original_fees_currency,
    entry_commission,
    exit_commission,
    heart_rate,
    sleep_score,
    sleep_hours,
    stress_level,
    CASE
        WHEN pnl > 0::numeric THEN 'profitable'::text
        WHEN pnl < 0::numeric THEN 'losing'::text
        ELSE 'breakeven'::text
    END AS trade_outcome,
    CASE
        WHEN sleep_score >= 80::numeric THEN 'excellent'::text
        WHEN sleep_score >= 65::numeric THEN 'good'::text
        WHEN sleep_score >= 50::numeric THEN 'fair'::text
        WHEN sleep_score IS NOT NULL THEN 'poor'::text
        ELSE 'unknown'::text
    END AS sleep_quality_category,
    CASE
        WHEN heart_rate >= 60::numeric AND heart_rate <= 80::numeric THEN 'normal'::text
        WHEN heart_rate > 80::numeric THEN 'elevated'::text
        WHEN heart_rate < 60::numeric THEN 'low'::text
        ELSE 'unknown'::text
    END AS heart_rate_category,
    CASE
        WHEN stress_level <= 0.3 THEN 'low'::text
        WHEN stress_level <= 0.6 THEN 'moderate'::text
        WHEN stress_level IS NOT NULL THEN 'high'::text
        ELSE 'unknown'::text
    END AS stress_category
FROM trades t;

-- Recreate the materialized view
CREATE MATERIALIZED VIEW health_trade_correlations AS
SELECT
    user_id,
    trade_outcome,
    count(*) AS trade_count,
    avg(heart_rate) AS avg_heart_rate,
    stddev(heart_rate) AS stddev_heart_rate,
    avg(sleep_score) AS avg_sleep_score,
    avg(sleep_hours) AS avg_sleep_hours,
    stddev(sleep_score) AS stddev_sleep_score,
    avg(stress_level) AS avg_stress_level,
    stddev(stress_level) AS stddev_stress_level,
    avg(pnl) AS avg_pnl,
    sum(pnl) AS total_pnl,
    count(*) FILTER (WHERE pnl > 0::numeric) AS winning_trades,
    count(*) FILTER (WHERE pnl < 0::numeric) AS losing_trades,
    CASE
        WHEN count(*) > 0 THEN count(*) FILTER (WHERE pnl > 0::numeric)::double precision / count(*)::double precision * 100::double precision
        ELSE 0::double precision
    END AS win_rate
FROM trades_with_health_analytics
WHERE heart_rate IS NOT NULL OR sleep_score IS NOT NULL OR stress_level IS NOT NULL
GROUP BY user_id, trade_outcome;

-- Also update broker_fee_settings if it exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'broker_fee_settings') THEN
        ALTER TABLE broker_fee_settings
        ALTER COLUMN commission_per_contract TYPE DECIMAL(20, 8),
        ALTER COLUMN commission_per_side TYPE DECIMAL(20, 8);
    END IF;
END $$;
