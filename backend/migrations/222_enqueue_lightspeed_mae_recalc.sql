-- Enqueue MAE/MFE recalculation for users affected by the Lightspeed time
-- shift (migrations 220/221).
--
-- Migration 221 nulled mae/mfe on the affected trades; persisted MAE/MFE is
-- only recomputed on trade create/update, so without a job the values would
-- stay empty. The mae_recalc job (utils/jobQueue.js processMAERecalc)
-- recomputes and persists them in rate-limited batches, re-enqueueing itself
-- until done. One job per affected user; idempotent (pending duplicates are
-- skipped).

INSERT INTO job_queue (type, data, priority, user_id, status, created_at)
SELECT
  'mae_recalc',
  jsonb_build_object('userId', affected.user_id),
  4,
  affected.user_id,
  'pending',
  NOW()
FROM (
  SELECT DISTINCT user_id
  FROM trades
  WHERE broker = 'lightspeed'
    AND created_at >= '2025-07-23'
    AND entry_time IS NOT NULL
    AND entry_time >= '2000-01-01'
    AND (entry_time AT TIME ZONE 'UTC') - (entry_time AT TIME ZONE 'America/New_York') = interval '5 hours'
) affected
WHERE NOT EXISTS (
  SELECT 1 FROM job_queue jq
  WHERE jq.type = 'mae_recalc'
    AND jq.user_id = affected.user_id
    AND jq.status = 'pending'
);
