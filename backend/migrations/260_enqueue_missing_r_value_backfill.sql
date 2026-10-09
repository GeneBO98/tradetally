-- Existing closed trades can have a valid stop but a NULL stored R after older
-- broker updates. Recalculate with Trade.calculateRValue in background batches
-- so stocks, options, and futures share the normal net-cost formula.
INSERT INTO job_queue (type, data, priority, user_id, status, created_at)
SELECT 'r_value_backfill', jsonb_build_object('userId', affected.user_id),
       4, affected.user_id, 'pending', NOW()
FROM (
  SELECT DISTINCT user_id
  FROM trades
  WHERE r_value IS NULL
    AND entry_price > 0 AND exit_price > 0 AND stop_loss > 0 AND quantity > 0
    AND ((side = 'long' AND stop_loss < entry_price)
      OR (side = 'short' AND stop_loss > entry_price))
) affected
WHERE NOT EXISTS (
  SELECT 1 FROM job_queue jq
  WHERE jq.type = 'r_value_backfill' AND jq.user_id = affected.user_id
    AND jq.status = 'pending'
);
