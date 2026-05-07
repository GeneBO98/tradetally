require('dotenv').config();

const db = require('../src/config/database');
const sequenzySubscriberSyncService = require('../src/services/sequenzySubscriberSyncService');

async function main() {
  if (!sequenzySubscriberSyncService.isConfigured()) {
    throw new Error('SEQUENZY_API_KEY is not configured.');
  }

  const result = await db.query(
    `SELECT id, email
     FROM users
     ORDER BY created_at ASC`
  );

  console.log(`[SEQUENZY] Syncing ${result.rows.length} users...`);

  for (const row of result.rows) {
    await sequenzySubscriberSyncService.syncUserById(row.id);
    console.log(`[SEQUENZY] Synced ${row.email}`);
  }

  console.log('[SEQUENZY] Subscriber sync complete');
}

main().catch((error) => {
  console.error('[SEQUENZY] Subscriber sync failed:', error.response?.data || error.message);
  process.exit(1);
});
