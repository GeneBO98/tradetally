-- Backfill issue #304 Tradovate execution metadata.
--
-- The parser fix now stores commission: 0 on Tradovate execution objects.
-- Existing imports may have execution-level fees but no commission key, which
-- causes edit round-trips and downstream execution-cost logic to see a
-- different shape than newly imported trades.

WITH normalized_executions AS (
  SELECT
    t.id,
    jsonb_agg(
      CASE
        WHEN jsonb_typeof(exec_item) = 'object'
          AND NOT exec_item ? 'commission'
          THEN jsonb_set(exec_item, '{commission}', '0'::jsonb, true)
        ELSE exec_item
      END
      ORDER BY exec_ord
    ) AS executions
  FROM trades t
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.executions, '[]'::jsonb))
    WITH ORDINALITY AS exec(exec_item, exec_ord)
  WHERE LOWER(COALESCE(t.broker, '')) = 'tradovate'
    AND t.executions IS NOT NULL
    AND jsonb_typeof(t.executions) = 'array'
    AND jsonb_array_length(t.executions) > 0
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(t.executions) AS existing_exec(item)
      WHERE jsonb_typeof(existing_exec.item) = 'object'
        AND NOT existing_exec.item ? 'commission'
    )
  GROUP BY t.id
)
UPDATE trades t
SET executions = normalized_executions.executions
FROM normalized_executions
WHERE t.id = normalized_executions.id
  AND normalized_executions.executions IS DISTINCT FROM t.executions;
