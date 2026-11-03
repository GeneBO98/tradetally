#!/usr/bin/env node

// One-off: IBKR connections whose last sync failed on a credential error
// (expired/invalid Flex token, invalid query ID, IP restriction) were left in
// 'active' or 'error' without ever telling the user. The sync now expires
// those connections and notifies the owner; this applies the same transition
// to the ones that failed before that change shipped.
//
// Usage:
//   node scripts/notify-ibkr-reauth-required.js            # preview
//   node scripts/notify-ibkr-reauth-required.js --apply    # expire + notify

const db = require('../src/config/database');
const BrokerReauthNotificationService = require('../src/services/brokerSync/brokerReauthNotificationService');
const { IBKR_REAUTH_INSTRUCTIONS } = require('../src/services/brokerSync/ibkrService');

const apply = process.argv.slice(2).includes('--apply');

const CREDENTIAL_MESSAGE_PATTERNS = [
  '%Flex Token is invalid%',
  '%Flex Token has expired%',
  '%check your Flex Token and Query ID%',
  '%Query is invalid%',
  '%IP restriction%',
  '%Legacy Flex Queries%'
];

async function main() {
  const { rows } = await db.query(`
    SELECT id, user_id, broker_type, connection_status, consecutive_failures,
           last_error_at, last_error_message, auto_sync_enabled
      FROM broker_connections
     WHERE broker_type = 'ibkr'
       AND connection_status <> 'expired'
       AND last_sync_status = 'failed'
       AND last_error_message ILIKE ANY($1::text[])
     ORDER BY last_error_at DESC NULLS LAST
  `, [CREDENTIAL_MESSAGE_PATTERNS]);

  console.log(`${rows.length} IBKR connection(s) failed on a credential error and were never notified:`);
  for (const row of rows) {
    const when = row.last_error_at ? new Date(row.last_error_at).toISOString().slice(0, 10) : 'n/a';
    console.log(`  ${row.id}  status=${row.connection_status} failures=${row.consecutive_failures} last=${when}  ${String(row.last_error_message).slice(0, 80)}`);
  }

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to expire these connections and send the reconnect notification + email.');
    return;
  }

  let notified = 0;
  for (const row of rows) {
    const connection = { id: row.id, userId: row.user_id, brokerType: row.broker_type };
    const sent = await BrokerReauthNotificationService.markRequired(connection, 'Interactive Brokers', {
      message: row.last_error_message,
      instructions: IBKR_REAUTH_INSTRUCTIONS,
      reauthMode: 'credentials'
    });
    if (sent) notified += 1;
  }
  console.log(`\nExpired and notified ${notified} of ${rows.length} connection(s).`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
