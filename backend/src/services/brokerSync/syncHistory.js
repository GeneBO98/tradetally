const db = require('../../config/database');
const BrokerConnection = require('../../models/BrokerConnection');

// Keep failed, running, manual and Activity syncs as individual entries. A
// completed automatic confirmation can be summarized even if it has warnings;
// its warning count and distinct messages stay visible on the daily row.
const groupable = `bc.broker_type = 'ibkr' AND bsl.sync_type = 'ibkr_confirmation'
  AND COALESCE(bsl.sync_details->>'report_type', 'trade_confirmation') = 'trade_confirmation'
  AND bsl.status = 'completed' AND COALESCE(bsl.trades_failed, 0) = 0
  AND COALESCE(bsl.error_message, '') = ''
  AND COALESCE(bsl.sync_details->>'manual_review_count', bsl.sync_details->>'manualReviewCount', '0') = '0'
  AND CASE WHEN jsonb_typeof(COALESCE(bsl.sync_details->'manual_review_items', bsl.sync_details->'manualReviewItems')) = 'array'
    THEN jsonb_array_length(COALESCE(bsl.sync_details->'manual_review_items', bsl.sync_details->'manualReviewItems')) = 0 ELSE true END`;
const warnings = `CASE WHEN jsonb_typeof(bsl.sync_details->'warnings') = 'array'
  THEN bsl.sync_details->'warnings' ELSE '[]'::jsonb END`;
const updated = `CASE WHEN bsl.sync_details->>'updated_count' ~ '^[0-9]+$'
  THEN (bsl.sync_details->>'updated_count')::bigint ELSE 0 END`;

function formatHistoryLog(row) {
  const log = row.log || row;
  const formatted = { ...BrokerConnection.formatSyncLog(log), brokerType: log.broker_type, account_label: log.account_label };
  if (log.daily_summary) {
    const messages = (log.sync_details?.warnings || []).flat().filter(message => typeof message === 'string' && message);
    return { ...formatted, daily_summary: true, local_date: log.local_date, sync_count: log.sync_count,
      warning_count: log.warning_count, syncDetails: { ...formatted.syncDetails, warnings: [...new Set(messages)] } };
  }
  return formatted;
}

async function getHistory(user_id, { connection_id = null, timezone = 'UTC', limit = 20, offset = 0 } = {}) {
  // LIMIT applies after grouping. Reading the latest N raw rows and grouping
  // in JavaScript would still let frequent polling displace important history.
  const result = await db.query(`WITH scoped AS (
    SELECT bsl.*, bc.broker_type, bc.account_label, (${groupable}) AS daily_summary,
      (bsl.created_at AT TIME ZONE $3)::date AS local_date,
      ${warnings} AS warning_messages, ${updated} AS updated_count
    FROM broker_sync_logs bsl JOIN broker_connections bc ON bc.id = bsl.connection_id
    WHERE bsl.user_id = $1 AND bc.user_id = $1 AND ($2::uuid IS NULL OR bc.id = $2)
  ), daily AS (
    SELECT jsonb_build_object(
      'id', 'ibkr-confirmation:' || connection_id::text || ':' || local_date::text,
      'connection_id', connection_id, 'user_id', user_id, 'broker_type', broker_type, 'account_label', account_label,
      'sync_type', 'ibkr_confirmation', 'status', 'completed', 'daily_summary', true, 'local_date', local_date,
      'sync_count', COUNT(*), 'trades_imported', SUM(COALESCE(trades_imported, 0)),
      'trades_failed', 0, 'trades_skipped', SUM(COALESCE(trades_skipped, 0)),
      'duplicates_detected', SUM(COALESCE(duplicates_detected, 0)),
      'warning_count', COUNT(*) FILTER (WHERE jsonb_array_length(warning_messages) > 0 OR sync_details->>'outcome' = 'warning'),
      'started_at', MIN(started_at), 'completed_at', MAX(completed_at), 'created_at', MAX(created_at),
      'sync_details', jsonb_build_object('report_type', 'trade_confirmation', 'updated_count', SUM(updated_count),
        'warnings', jsonb_agg(warning_messages ORDER BY created_at, id),
        'outcome', CASE WHEN bool_or(jsonb_array_length(warning_messages) > 0 OR sync_details->>'outcome' = 'warning') THEN 'warning' ELSE 'success' END,
        'pending_reconciliation_count', (array_agg(sync_details->'pending_reconciliation_count' ORDER BY created_at DESC, id DESC))[1])
    ) AS log, MAX(created_at) AS sort_date
    FROM scoped WHERE daily_summary GROUP BY connection_id, user_id, broker_type, account_label, local_date
  ), individual AS (
    SELECT to_jsonb(scoped) - 'daily_summary' - 'local_date' - 'warning_messages' - 'updated_count' AS log,
      created_at AS sort_date FROM scoped WHERE NOT daily_summary
  ) SELECT log FROM (SELECT * FROM daily UNION ALL SELECT * FROM individual) history
    ORDER BY sort_date DESC, log->>'id' DESC LIMIT $4 OFFSET $5`, [user_id, connection_id, timezone, limit + 1, offset]);
  return { data: result.rows.slice(0, limit).map(formatHistoryLog), has_more: result.rows.length > limit };
}

async function getDay(user_id, { connection_id, local_date, timezone = 'UTC', limit = 50, offset = 0 }) {
  const result = await db.query(`SELECT bsl.*, bc.broker_type, bc.account_label
    FROM broker_sync_logs bsl JOIN broker_connections bc ON bc.id = bsl.connection_id
    WHERE bsl.user_id = $1 AND bc.user_id = $1 AND bc.id = $2 AND (${groupable})
      AND bsl.created_at >= ($3::date::timestamp AT TIME ZONE $4)
      AND bsl.created_at < (($3::date + 1)::timestamp AT TIME ZONE $4)
    ORDER BY bsl.created_at DESC, bsl.id DESC LIMIT $5 OFFSET $6`, [user_id, connection_id, local_date, timezone, limit + 1, offset]);
  return { data: result.rows.slice(0, limit).map(formatHistoryLog), has_more: result.rows.length > limit };
}
module.exports = { getHistory, getDay };
