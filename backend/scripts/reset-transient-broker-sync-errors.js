#!/usr/bin/env node

// One-off repair: broker connections that were locked into connection_status
// 'error' by transient failures (IBKR report timeouts, HTTP/network timeouts,
// Postgres connection timeouts, the old broker_sync_logs sync_type constraint).
// Those errors said nothing about the user's configuration, but before
// updateAfterFailure learned to distinguish transient failures three of them
// in a row disabled automatic sync permanently.
//
// Resets the matching connections to a retryable state so the scheduler picks
// them up on its next pass. Configuration errors (invalid token, invalid
// query, expired auth) are intentionally left alone: retrying those would
// burn IBKR's failure lockout for nothing.
//
// Usage:
//   node scripts/reset-transient-broker-sync-errors.js            # preview
//   node scripts/reset-transient-broker-sync-errors.js --apply    # commit
//   node scripts/reset-transient-broker-sync-errors.js --broker ibkr --apply

const db = require('../src/config/database');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const brokerIndex = args.indexOf('--broker');
const broker = brokerIndex >= 0 ? args[brokerIndex + 1] : null;

const TRANSIENT_MESSAGE_PATTERNS = [
  'Timeout waiting for IBKR report generation',
  'timeout of % exceeded',
  'Connection terminated due to connection timeout',
  'timeout exceeded when trying to connect',
  '%broker_sync_logs_sync_type_check%',
  '%ECONNRESET%',
  '%ECONNREFUSED%',
  '%EAI_AGAIN%',
  '%ENOTFOUND%',
  '%ETIMEDOUT%',
  '%socket hang up%'
];

const whereClause = `
  WHERE connection_status = 'error'
    AND last_error_message ILIKE ANY($1::text[])
    ${broker ? 'AND broker_type = $2' : ''}
`;
const params = broker ? [TRANSIENT_MESSAGE_PATTERNS, broker] : [TRANSIENT_MESSAGE_PATTERNS];

const selectSql = `
  SELECT id, user_id, broker_type, consecutive_failures, auto_sync_enabled,
         last_error_at, left(last_error_message, 80) AS last_error_message
  FROM broker_connections
  ${whereClause}
  ORDER BY last_error_at DESC NULLS LAST
`;

const updateSql = `
  UPDATE broker_connections
  SET connection_status = 'active',
      consecutive_failures = 0,
      last_sync_status = 'warning',
      last_sync_message = 'Automatic sync re-enabled after a transient failure; the next scheduled sync will retry.',
      next_scheduled_sync = NOW(),
      broker_metadata = COALESCE(broker_metadata, '{}'::jsonb) - 'ibkr_backfill_retry' - 'transient_retry_count',
      updated_at = CURRENT_TIMESTAMP
  ${whereClause}
  RETURNING id, broker_type
`;

async function main() {
  console.log('SQL that will run with --apply:');
  console.log(updateSql);
  console.log('Parameters:', JSON.stringify(params));
  console.log('');

  const preview = await db.query(selectSql, params);
  if (preview.rows.length === 0) {
    console.log('No connections match. Nothing to do.');
    return;
  }

  console.log(`${preview.rows.length} connection(s) locked in 'error' by a transient failure:`);
  for (const row of preview.rows) {
    console.log(`  ${row.id}  ${row.broker_type.padEnd(7)} failures=${row.consecutive_failures} auto_sync=${row.auto_sync_enabled} last=${row.last_error_at ? row.last_error_at.toISOString().slice(0, 10) : 'n/a'}  ${row.last_error_message}`);
  }

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to reset them.');
    return;
  }

  const result = await db.query(updateSql, params);
  console.log(`\n[SUCCESS] Reset ${result.rows.length} connection(s) to active; the scheduler will retry them on its next 15-minute pass.`);
}

main()
  .catch(error => {
    console.error('Failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
