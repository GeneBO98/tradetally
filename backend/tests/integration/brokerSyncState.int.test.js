const { randomUUID } = require('crypto');
const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');
const retry_contract = require('../../../tests/fixtures/trading-calculation-contracts.json').ibkr_backfill_retry;

describe('broker sync coordination with real PostgreSQL', () => {
  let user_id;
  let connection_id;

  beforeAll(async () => {
    user_id = randomUUID();
    connection_id = randomUUID();
    await db.query(`INSERT INTO users (id, email, username, password_hash)
      VALUES ($1, $2, $3, 'test-only')`,
    [user_id, `sync-state-${user_id}@example.com`, `sync_${user_id.slice(0, 8)}`]);
    await db.query(`INSERT INTO broker_connections
      (id, user_id, broker_type, connection_status, auto_sync_enabled)
      VALUES ($1, $2, 'ibkr', 'active', false)`, [connection_id, user_id]);
  });

  afterAll(async () => {
    try { await db.query('DELETE FROM users WHERE id = $1', [user_id]); }
    finally { await db.pool.end(); }
  });

  test('only one client can own a connection sync lock and release allows another sync', async () => {
    const first_lock = await BrokerConnection.acquireSyncLock(connection_id);
    expect(first_lock).not.toBeNull();
    try {
      expect(await BrokerConnection.acquireSyncLock(connection_id)).toBeNull();
    } finally {
      await first_lock.release();
    }
    const next_lock = await BrokerConnection.acquireSyncLock(connection_id);
    expect(next_lock).not.toBeNull();
    await next_lock.release();
    await next_lock.release();
  });

  test('persists the retry cursor and only selects it once the hourly retry is due', async () => {
    const saved = await BrokerConnection.scheduleIBKRBackfillRetry(connection_id, {
      floor: retry_contract.floor,
      windowStart: '2025-01-01', windowEnd: retry_contract.window_end,
      retryCount: retry_contract.retry_count, referenceCode: retry_contract.reference_code
    });
    expect(saved.ibkrBackfillRetry).toMatchObject({
      floor: retry_contract.floor, window_end: retry_contract.window_end,
      retry_count: retry_contract.retry_count, reference_code: retry_contract.reference_code
    });
    expect((await BrokerConnection.findDueForSync()).some(row => row.id === connection_id)).toBe(false);
    await db.query(`UPDATE broker_connections SET broker_metadata = jsonb_set(
      broker_metadata, '{ibkr_backfill_retry,retry_at}', to_jsonb((NOW() - INTERVAL '1 minute')::text))
      WHERE id = $1`, [connection_id]);
    expect((await BrokerConnection.findDueForSync()).some(row => row.id === connection_id)).toBe(true);
  });

  test('clearing the cursor stops retries for a connection with automatic sync disabled', async () => {
    await BrokerConnection.clearIBKRBackfillRetry(connection_id);
    expect((await BrokerConnection.findDueForSync()).some(row => row.id === connection_id)).toBe(false);
    const stored = await db.query('SELECT broker_metadata FROM broker_connections WHERE id = $1', [connection_id]);
    expect(stored.rows[0].broker_metadata.ibkr_backfill_retry).toBeUndefined();
  });
});
