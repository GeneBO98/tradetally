-- Recalculate derived data for the Lightspeed trades whose execution times
-- were shifted by migration 220.
--
-- MAE/MFE, post-exit excursions, and setup-quality grades were computed from
-- the old (one hour early) times, so their candle windows were wrong. NULLing
-- them re-enters the existing recalculation machinery:
--   - MAE/MFE recompute lazily on trade view (trade.controller autoCalculate)
--     and in bulk on the analytics path, which also spreads the market-data
--     API load instead of bursting it at boot.
--   - Quality regrades via the queued quality_backfill jobs below (NULL
--     grade/metrics matches tradeQuality.getStaleQualityCondition).
--
-- Scope matches migration 220's rows: EST-season Lightspeed trades imported
-- while the fixed +4h parser offset was live. Unlike 220 this is idempotent
-- (re-nulling is a no-op, and duplicate pending jobs are skipped).

UPDATE trades
SET
  mae = NULL,
  mfe = NULL,
  post_exit_mae = NULL,
  post_exit_mfe = NULL,
  quality_grade = NULL,
  quality_score = NULL,
  quality_metrics = NULL,
  updated_at = NOW()
WHERE broker = 'lightspeed'
  AND created_at >= '2025-07-23'
  AND entry_time IS NOT NULL
  AND entry_time >= '2000-01-01'
  AND (entry_time AT TIME ZONE 'UTC') - (entry_time AT TIME ZONE 'America/New_York') = interval '5 hours';

INSERT INTO job_queue (type, data, priority, user_id, status, created_at)
SELECT
  'quality_backfill',
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
  WHERE jq.type = 'quality_backfill'
    AND jq.user_id = affected.user_id
    AND jq.status = 'pending'
);

DELETE FROM analytics_cache;
