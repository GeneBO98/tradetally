-- Fix numeric field overflow for PnL calculation by increasing precision
-- This addresses issues with trades that have large quantities or significant price movements

-- First, drop dependent views
DROP VIEW IF EXISTS trades_with_health_analytics CASCADE;

-- Increase PnL field precision to handle larger values
-- numeric(20,6) allows for 14 digits before decimal and 6 after
-- This provides much more room for large P&L values while maintaining precision
ALTER TABLE trades
ALTER COLUMN pnl TYPE NUMERIC(20, 6);

-- Also increase pnl_percent precision for consistency
ALTER TABLE trades
ALTER COLUMN pnl_percent TYPE NUMERIC(15, 6);

-- Recreate the view
CREATE OR REPLACE VIEW trades_with_health_analytics AS
SELECT 
    t.*,
    CASE 
        WHEN t.pnl > 0 THEN 'profitable'
        WHEN t.pnl < 0 THEN 'losing'
        ELSE 'breakeven'
    END as trade_outcome
FROM trades t;

-- Add comments for documentation
COMMENT ON COLUMN trades.pnl IS 'Profit/Loss with increased precision to handle large trade values (up to 14 digits before decimal, 6 after)';
COMMENT ON COLUMN trades.pnl_percent IS 'P&L percentage with increased precision for better accuracy';