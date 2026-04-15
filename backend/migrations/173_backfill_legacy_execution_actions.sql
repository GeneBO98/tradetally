-- Backfill canonical execution.action values for legacy trades.
--
-- Older trades were stored with execution.side/type but no action, which leaves
-- multiple analytics and repair paths treating historical executions
-- inconsistently. Newer code paths normalize this in memory; this migration
-- persists the canonical action on existing rows.

WITH normalized_executions AS (
  SELECT
    t.id,
    jsonb_agg(
      CASE
        WHEN derived_action IS NULL THEN exec_item
        ELSE jsonb_set(exec_item - 'action', '{action}', to_jsonb(derived_action), true)
      END
      ORDER BY exec_ord
    ) AS executions
  FROM trades t
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.executions, '[]'::jsonb))
    WITH ORDINALITY AS exec(exec_item, exec_ord)
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN jsonb_typeof(exec_item) <> 'object' THEN NULL

      -- Grouped executions already carry explicit entry/exit prices and do not
      -- need action normalization.
      WHEN exec_item ? 'entryPrice'
        OR exec_item ? 'entry_price'
        OR exec_item ? 'entryTime'
        OR exec_item ? 'entry_time'
        OR exec_item ? 'exitPrice'
        OR exec_item ? 'exit_price'
        OR exec_item ? 'exitTime'
        OR exec_item ? 'exit_time'
        THEN NULL

      -- Canonicalize existing action values first.
      WHEN LOWER(BTRIM(COALESCE(exec_item->>'action', ''))) IN ('buy', 'bot', 'long') THEN 'buy'
      WHEN LOWER(BTRIM(COALESCE(exec_item->>'action', ''))) IN ('sell', 'sold', 'short', 'sld') THEN 'sell'

      -- Legacy executions often stored long/short in side.
      WHEN LOWER(BTRIM(COALESCE(exec_item->>'side', ''))) IN ('buy', 'bot', 'long') THEN 'buy'
      WHEN LOWER(BTRIM(COALESCE(exec_item->>'side', ''))) IN ('sell', 'sold', 'short', 'sld') THEN 'sell'

      -- Fall back to entry/exit with the trade side when side is absent.
      WHEN LOWER(BTRIM(COALESCE(exec_item->>'type', ''))) = 'entry'
        AND LOWER(BTRIM(COALESCE(t.side, ''))) IN ('long', 'buy')
        THEN 'buy'
      WHEN LOWER(BTRIM(COALESCE(exec_item->>'type', ''))) = 'entry'
        AND LOWER(BTRIM(COALESCE(t.side, ''))) IN ('short', 'sell')
        THEN 'sell'
      WHEN LOWER(BTRIM(COALESCE(exec_item->>'type', ''))) = 'exit'
        AND LOWER(BTRIM(COALESCE(t.side, ''))) IN ('long', 'buy')
        THEN 'sell'
      WHEN LOWER(BTRIM(COALESCE(exec_item->>'type', ''))) = 'exit'
        AND LOWER(BTRIM(COALESCE(t.side, ''))) IN ('short', 'sell')
        THEN 'buy'

      ELSE NULL
    END AS derived_action
  ) normalized
  WHERE t.executions IS NOT NULL
    AND jsonb_array_length(t.executions) > 0
  GROUP BY t.id
)
UPDATE trades t
SET executions = normalized_executions.executions
FROM normalized_executions
WHERE t.id = normalized_executions.id
  AND normalized_executions.executions IS DISTINCT FROM t.executions;
