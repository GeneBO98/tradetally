-- Fix trades that have quantity = 0 by calculating from execution data
-- This addresses trades imported with the CSV parser bug

UPDATE trades 
SET quantity = (
  SELECT SUM(ABS(CAST(exec_data->>'quantity' AS DECIMAL)))
  FROM jsonb_array_elements(executions) AS exec_data
  WHERE exec_data->>'quantity' IS NOT NULL
)
WHERE quantity = 0 
  AND executions IS NOT NULL 
  AND jsonb_array_length(executions) > 0;

-- Log the number of affected trades
DO $$
DECLARE
    affected_count INTEGER;
BEGIN
    GET DIAGNOSTICS affected_count = ROW_COUNT;
    RAISE NOTICE 'Fixed % trades with zero quantity', affected_count;
END $$;