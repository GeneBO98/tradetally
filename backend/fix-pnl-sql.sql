-- SQL Script to Fix Incorrect P/L Calculations
-- Run this to update trades with corrected P/L values

-- First, let's identify the problematic trades
SELECT 
    id,
    symbol,
    quantity,
    entry_price,
    exit_price,
    side,
    pnl as current_pnl,
    pnl_percent as current_pnl_percent,
    commission,
    fees,
    notes,
    -- Calculate what P/L should be
    CASE 
        WHEN side = 'long' THEN 
            (exit_price - entry_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0)
        WHEN side = 'short' THEN 
            (entry_price - exit_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0)
        ELSE 0
    END as correct_pnl,
    -- Calculate what P/L% should be
    CASE 
        WHEN side = 'long' AND entry_price > 0 THEN 
            ((exit_price - entry_price) / entry_price) * 100
        WHEN side = 'short' AND entry_price > 0 THEN 
            ((entry_price - exit_price) / entry_price) * 100
        ELSE 0
    END as correct_pnl_percent,
    -- Calculate the difference
    ABS(
        COALESCE(pnl, 0) - 
        CASE 
            WHEN side = 'long' THEN 
                (exit_price - entry_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0)
            WHEN side = 'short' THEN 
                (entry_price - exit_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0)
            ELSE 0
        END
    ) as pnl_difference
FROM trades 
WHERE exit_price IS NOT NULL 
  AND (
    notes ILIKE '%partial close%' 
    OR notes ILIKE '%closed existing position%'
    OR notes ILIKE '%updated existing position%'
    OR id = 'b44dc803-a429-407b-913b-6f9aa6f71ce4' -- Your specific PYXS trade
    OR (
        -- P/L is significantly different from expected
        ABS(
            COALESCE(pnl, 0) - 
            CASE 
                WHEN side = 'long' THEN 
                    (exit_price - entry_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0)
                WHEN side = 'short' THEN 
                    (entry_price - exit_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0)
                ELSE 0
            END
        ) > 1.00
    )
  )
ORDER BY updated_at DESC;

-- Now update the trades with correct P/L calculations
-- IMPORTANT: Review the SELECT results above before running this UPDATE!

UPDATE trades 
SET 
    pnl = CASE 
        WHEN side = 'long' THEN 
            (exit_price - entry_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0)
        WHEN side = 'short' THEN 
            (entry_price - exit_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0)
        ELSE 0
    END,
    pnl_percent = CASE 
        WHEN side = 'long' AND entry_price > 0 THEN 
            ((exit_price - entry_price) / entry_price) * 100
        WHEN side = 'short' AND entry_price > 0 THEN 
            ((entry_price - exit_price) / entry_price) * 100
        ELSE 0
    END,
    updated_at = CURRENT_TIMESTAMP
WHERE exit_price IS NOT NULL 
  AND (
    notes ILIKE '%partial close%' 
    OR notes ILIKE '%closed existing position%'
    OR notes ILIKE '%updated existing position%'
    OR id = 'b44dc803-a429-407b-913b-6f9aa6f71ce4' -- Your specific PYXS trade
    OR (
        -- Only update trades where P/L is significantly wrong
        ABS(
            COALESCE(pnl, 0) - 
            CASE 
                WHEN side = 'long' THEN 
                    (exit_price - entry_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0)
                WHEN side = 'short' THEN 
                    (entry_price - exit_price) * quantity - COALESCE(commission, 0) - COALESCE(fees, 0)
                ELSE 0
            END
        ) > 1.00
    )
  );

-- Verify the fix by checking the specific PYXS trade
SELECT 
    id,
    symbol,
    quantity,
    entry_price,
    exit_price,
    side,
    pnl,
    pnl_percent,
    commission,
    fees,
    notes,
    updated_at
FROM trades 
WHERE id = 'b44dc803-a429-407b-913b-6f9aa6f71ce4';

-- Show summary of what was fixed
SELECT 
    COUNT(*) as trades_updated,
    SUM(CASE WHEN pnl > 0 THEN 1 ELSE 0 END) as profitable_trades,
    SUM(CASE WHEN pnl < 0 THEN 1 ELSE 0 END) as losing_trades,
    ROUND(AVG(pnl), 2) as avg_pnl,
    ROUND(SUM(pnl), 2) as total_pnl_corrected
FROM trades 
WHERE updated_at > (CURRENT_TIMESTAMP - INTERVAL '1 hour')
  AND exit_price IS NOT NULL;