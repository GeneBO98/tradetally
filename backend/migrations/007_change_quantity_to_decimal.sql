-- Migration to change quantity column from INTEGER to DECIMAL(10, 4)
-- This handles fractional shares and options contracts

-- Step 1: Drop dependent views
DROP VIEW IF EXISTS trades_with_health_analytics CASCADE;

-- Step 2: Alter the column type
ALTER TABLE trades
ALTER COLUMN quantity TYPE DECIMAL(10, 4);

-- Step 3: Recreate the view
CREATE VIEW trades_with_health_analytics AS
SELECT t.id,
    t.user_id,
    t.symbol,
    t.trade_date,
    t.entry_time,
    t.exit_time,
    t.entry_price,
    t.exit_price,
    t.quantity,
    t.side,
    t.commission,
    t.fees,
    t.pnl,
    t.pnl_percent,
    t.notes,
    t.is_public,
    t.broker,
    t.strategy,
    t.setup,
    t.tags,
    t.created_at,
    t.updated_at,
    t.executions,
    t.mae,
    t.mfe,
    t.split_adjusted,
    t.original_quantity,
    t.original_entry_price,
    t.original_exit_price,
    t.strategy_confidence,
    t.classification_method,
    t.classification_metadata,
    t.manual_override,
    t.round_trip_id,
    t.news_events,
    t.has_news,
    t.news_sentiment,
    t.news_checked_at,
    t.confidence,
    t.enrichment_status,
    t.enrichment_completed_at,
    CASE
        WHEN t.pnl > 0::numeric THEN 'profitable'::text
        WHEN t.pnl < 0::numeric THEN 'losing'::text
        ELSE 'breakeven'::text
    END AS trade_outcome
FROM trades t;