-- Calculate and set R-Value for trade with stopLoss in executions
-- Trade ID: 1d652fad-d7af-4d21-9ce2-4dc5df2f1731

\echo 'Calculating R-Value for trade 1d652fad-d7af-4d21-9ce2-4dc5df2f1731...'
\echo ''

-- Calculate weighted averages from executions
WITH execution_data AS (
  SELECT
    t.id,
    t.symbol,
    t.side,
    t.entry_price,
    t.exit_price,
    t.stop_loss as trade_level_stop_loss,
    jsonb_array_elements(t.executions) as execution
  FROM trades t
  WHERE t.id = '1d652fad-d7af-4d21-9ce2-4dc5df2f1731'
),
executions_with_stop_loss AS (
  SELECT
    id,
    symbol,
    side,
    entry_price,
    exit_price,
    trade_level_stop_loss,
    (execution->>'stopLoss')::numeric as exec_stop_loss,
    (execution->>'entryPrice')::numeric as exec_entry_price,
    (execution->>'exitPrice')::numeric as exec_exit_price,
    (execution->>'quantity')::numeric as exec_quantity
  FROM execution_data
  WHERE execution->>'stopLoss' IS NOT NULL
),
weighted_averages AS (
  SELECT
    id,
    symbol,
    side,
    SUM(exec_quantity) as total_quantity,
    SUM(exec_entry_price * exec_quantity) / NULLIF(SUM(exec_quantity), 0) as weighted_entry_price,
    SUM(exec_stop_loss * exec_quantity) / NULLIF(SUM(exec_quantity), 0) as weighted_stop_loss,
    SUM(exec_exit_price * exec_quantity) / NULLIF(SUM(exec_quantity), 0) as weighted_exit_price
  FROM executions_with_stop_loss
  GROUP BY id, symbol, side
),
r_value_calculation AS (
  SELECT
    id,
    symbol,
    side,
    weighted_entry_price,
    weighted_stop_loss,
    weighted_exit_price,
    total_quantity,
    CASE
      -- For long positions: R = (exit - entry) / (entry - stop)
      WHEN side = 'long' THEN
        (weighted_exit_price - weighted_entry_price) / NULLIF(ABS(weighted_entry_price - weighted_stop_loss), 0)
      -- For short positions: R = (entry - exit) / (stop - entry)
      WHEN side = 'short' THEN
        (weighted_entry_price - weighted_exit_price) / NULLIF(ABS(weighted_stop_loss - weighted_entry_price), 0)
      ELSE NULL
    END as calculated_r_value
  FROM weighted_averages
)
-- Display calculation details
SELECT
  symbol,
  side,
  total_quantity as "Total Qty",
  ROUND(weighted_entry_price::numeric, 2) as "Avg Entry",
  ROUND(weighted_stop_loss::numeric, 2) as "Avg Stop Loss",
  ROUND(weighted_exit_price::numeric, 2) as "Avg Exit",
  ROUND(calculated_r_value::numeric, 3) as "R-Value"
FROM r_value_calculation;

\echo ''
\echo 'Updating R-Value in database...'

-- Update the trade with calculated R-Value
WITH execution_data AS (
  SELECT
    t.id,
    t.side,
    jsonb_array_elements(t.executions) as execution
  FROM trades t
  WHERE t.id = '1d652fad-d7af-4d21-9ce2-4dc5df2f1731'
),
executions_with_stop_loss AS (
  SELECT
    id,
    side,
    (execution->>'stopLoss')::numeric as exec_stop_loss,
    (execution->>'entryPrice')::numeric as exec_entry_price,
    (execution->>'exitPrice')::numeric as exec_exit_price,
    (execution->>'quantity')::numeric as exec_quantity
  FROM execution_data
  WHERE execution->>'stopLoss' IS NOT NULL
),
weighted_averages AS (
  SELECT
    id,
    side,
    SUM(exec_entry_price * exec_quantity) / NULLIF(SUM(exec_quantity), 0) as weighted_entry_price,
    SUM(exec_stop_loss * exec_quantity) / NULLIF(SUM(exec_quantity), 0) as weighted_stop_loss,
    SUM(exec_exit_price * exec_quantity) / NULLIF(SUM(exec_quantity), 0) as weighted_exit_price
  FROM executions_with_stop_loss
  GROUP BY id, side
),
r_value_calculation AS (
  SELECT
    id,
    CASE
      WHEN side = 'long' THEN
        (weighted_exit_price - weighted_entry_price) / NULLIF(ABS(weighted_entry_price - weighted_stop_loss), 0)
      WHEN side = 'short' THEN
        (weighted_entry_price - weighted_exit_price) / NULLIF(ABS(weighted_stop_loss - weighted_entry_price), 0)
      ELSE NULL
    END as calculated_r_value
  FROM weighted_averages
)
UPDATE trades
SET r_value = r.calculated_r_value,
    updated_at = NOW()
FROM r_value_calculation r
WHERE trades.id = r.id
RETURNING trades.symbol, ROUND(trades.r_value::numeric, 3) || 'R' as "Updated R-Value";

\echo ''
\echo 'Done! R-Value has been calculated and saved.'
