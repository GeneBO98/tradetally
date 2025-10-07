-- Increase symbol column length to support options symbols
-- Migration 066: Increase symbol field length for options/futures support

-- Options symbols like "SEDG  250919P00029000" are 21 characters
-- Increase to 30 to allow for longer futures symbols as well

-- Drop dependent view
DROP VIEW IF EXISTS trades_with_health_analytics;

-- Alter the columns in all tables
ALTER TABLE trades ALTER COLUMN symbol TYPE VARCHAR(30);
ALTER TABLE stock_splits ALTER COLUMN symbol TYPE VARCHAR(30);
ALTER TABLE stock_split_check_log ALTER COLUMN symbol TYPE VARCHAR(30);
ALTER TABLE symbol_categories ALTER COLUMN symbol TYPE VARCHAR(30);
ALTER TABLE symbol_categories ALTER COLUMN ticker TYPE VARCHAR(30);
ALTER TABLE enrichment_cache ALTER COLUMN symbol TYPE VARCHAR(30);
ALTER TABLE global_enrichment_cache ALTER COLUMN symbol TYPE VARCHAR(30);
ALTER TABLE news_cache ALTER COLUMN symbol TYPE VARCHAR(30);
ALTER TABLE round_trip_trades ALTER COLUMN symbol TYPE VARCHAR(30);

-- Recreate the view
CREATE VIEW trades_with_health_analytics AS
SELECT id,
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
    strategy_confidence,
    classification_method,
    classification_metadata,
    manual_override,
    round_trip_id,
    news_events,
    has_news,
    news_sentiment,
    news_checked_at,
    confidence,
    enrichment_status,
    enrichment_completed_at,
    CASE
        WHEN pnl > 0::numeric THEN 'profitable'::text
        WHEN pnl < 0::numeric THEN 'losing'::text
        ELSE 'breakeven'::text
    END AS trade_outcome
FROM trades t;
