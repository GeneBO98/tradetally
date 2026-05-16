#!/usr/bin/env node

require('dotenv').config();

const OperationalAlert = require('../src/models/OperationalAlert');
const db = require('../src/config/database');

function hasFlag(name) {
  return process.argv.includes(name);
}

async function main() {
  const result = await OperationalAlert.cleanupEscalationDeliveryReplayRequests({
    dryRun: hasFlag('--dry-run') || process.env.ALERT_REPLAY_CLEANUP_DRY_RUN === 'true',
    pendingOlderThanHours: process.env.ALERT_REPLAY_PENDING_TTL_HOURS,
    reviewedOlderThanDays: process.env.ALERT_REPLAY_REVIEWED_TTL_DAYS
  });
  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch(error => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.pool.end());
