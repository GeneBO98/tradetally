const { randomUUID } = require('crypto');
const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');
const history = require('../../src/services/brokerSync/syncHistory');

const user_id = randomUUID(), other_user_id = randomUUID();
let connection_id, second_id, other_connection_id;
beforeAll(async () => {
  for (const id of [user_id, other_user_id]) {
    await db.query(`INSERT INTO users (id,email,username,password_hash) VALUES ($1,$2,$3,'test')`,
      [id, `history-${id}@example.com`, `history_${id.slice(0, 8)}`]);
  }
  for (const [owner, query_id, label] of [[user_id, 'first', 'Primary'], [user_id, 'second', 'Secondary'], [other_user_id, 'private', 'Private']]) {
    const connection = await BrokerConnection.create(owner, { brokerType: 'ibkr', ibkrFlexToken: 'test',
      ibkrFlexQueryId: query_id, accountLabel: label, autoSyncEnabled: true, ibkr_trade_confirmation_query_id: 'confirmation' });
    if (query_id === 'first') connection_id = connection.id;
    if (query_id === 'second') second_id = connection.id;
    if (query_id === 'private') other_connection_id = connection.id;
    await BrokerConnection.updateStatus(connection.id, 'active');
  }
});
afterEach(async () => { await db.query('DELETE FROM broker_sync_logs WHERE user_id=ANY($1::uuid[])', [[user_id, other_user_id]]); });
afterAll(async () => {
  try { await db.query('DELETE FROM users WHERE id=ANY($1::uuid[])', [[user_id, other_user_id]]); }
  finally { await db.pool.end(); }
});
async function log({ connection = connection_id, owner = user_id, time = '2026-11-11T12:00:00Z', type = 'ibkr_confirmation', status = 'completed', details = {}, imported = 0, failed = 0 } = {}) {
  const result = await db.query(`INSERT INTO broker_sync_logs
    (connection_id,user_id,sync_type,status,created_at,started_at,completed_at,trades_imported,trades_failed,duplicates_detected,sync_details)
    VALUES ($1,$2,$3,$4,$5,$5,$5,$6,$7,2,$8::jsonb) RETURNING id`,
    [connection, owner, type, status, time, imported, failed, JSON.stringify({ report_type: 'trade_confirmation', outcome: 'success', ...details })]);
  return result.rows[0].id;
}

test('groups before limiting so 96 polls cannot displace an older Activity entry', async () => {
  const activity_id = await log({ type: 'scheduled', time: '2026-11-10T06:00:00Z', details: { report_type: 'activity' } });
  for (let index = 0; index < 96; index++) {
    await log({ time: new Date(Date.UTC(2026, 10, 11, 0, index * 15)).toISOString(), imported: index === 0 ? 1 : 0,
      details: { updated_count: index === 5 ? 2 : 0, pending_reconciliation_count: index === 95 ? 0 : 5 } });
  }
  const result = await history.getHistory(user_id, { limit: 2 });
  expect(result.has_more).toBe(false);
  expect(result.data).toHaveLength(2);
  expect(result.data[0]).toMatchObject({ daily_summary: true, sync_count: 96, local_date: '2026-11-11', tradesImported: 1,
    account_label: 'Primary', syncDetails: { updated_count: 2, pending_reconciliation_count: 0 } });
  expect(result.data[1].id).toBe(activity_id);
  const first_page = await history.getDay(user_id, { connection_id, local_date: '2026-11-11', limit: 50 });
  const second_page = await history.getDay(user_id, { connection_id, local_date: '2026-11-11', limit: 50, offset: 50 });
  expect(first_page.has_more).toBe(true);
  expect(second_page.has_more).toBe(false);
  expect(new Set([...first_page.data, ...second_page.data].map(row => row.id)).size).toBe(96);
});

test('manual syncs, failures, in-progress entries and manual review remain individual', async () => {
  const individual_ids = [];
  individual_ids.push(await log({ type: 'manual' }));
  individual_ids.push(await log({ status: 'failed' }));
  individual_ids.push(await log({ status: 'fetching' }));
  individual_ids.push(await log({ failed: 1 }));
  individual_ids.push(await log({ details: { manual_review_count: 1, manual_review_items: [{ id: 'review' }] } }));
  await log({ details: { warnings: ['Report not available yet'], outcome: 'warning' } });
  await log({ details: { warnings: ['Report not available yet'], outcome: 'warning' } });
  const result = await history.getHistory(user_id);
  expect(result.data.filter(row => !row.daily_summary).map(row => row.id).sort()).toEqual(individual_ids.sort());
  expect(result.data.find(row => row.daily_summary)).toMatchObject({ warning_count: 2, sync_count: 2,
    syncDetails: { warnings: ['Report not available yet'], outcome: 'warning' } });
});

test('groups each connection separately and never exposes another user’s logs or details', async () => {
  await log();
  await log({ connection: second_id });
  await log({ connection: other_connection_id, owner: other_user_id });
  const result = await history.getHistory(user_id);
  expect(result.data.map(row => row.connectionId).sort()).toEqual([connection_id, second_id].sort());
  expect((await history.getHistory(user_id, { connection_id: other_connection_id })).data).toEqual([]);
  expect((await history.getDay(user_id, { connection_id: other_connection_id, local_date: '2026-11-11' })).data).toEqual([]);
});

test.each([
  ['2026-11-01', '2026-11-01T04:30:00Z', '2026-11-02T04:30:00Z', '2026-11-02T05:00:00Z'],
  ['2026-03-08', '2026-03-08T05:30:00Z', '2026-03-09T03:30:00Z', '2026-03-09T04:00:00Z']
])('day %s uses the user timezone across DST instead of fixed 24-hour windows', async (local_date, first, last, next) => {
  await log({ time: first }); await log({ time: last }); await log({ time: next });
  const daily = (await history.getHistory(user_id, { timezone: 'America/New_York' })).data.find(row => row.local_date === local_date);
  expect(daily.sync_count).toBe(2);
  expect((await history.getDay(user_id, { connection_id, local_date, timezone: 'America/New_York' })).data).toHaveLength(2);
});

test('history pages retain older summaries and legacy raw queries retain individual entries', async () => {
  for (let day = 1; day <= 3; day++) await log({ time: `2026-11-0${day}T12:00:00Z` });
  const first = await history.getHistory(user_id, { limit: 2 });
  const next = await history.getHistory(user_id, { limit: 2, offset: 2 });
  expect(first.has_more).toBe(true);
  expect(next.has_more).toBe(false);
  expect(next.data[0].local_date).toBe('2026-11-01');
  expect((await BrokerConnection.getSyncLogs(connection_id)).map(row => row.daily_summary)).toEqual([undefined, undefined, undefined]);
});

test('interval changes only affect confirmation scheduling and preserve backfill state and reconnect settings', async () => {
  const original = await BrokerConnection.findById(connection_id);
  expect(original.ibkr_confirmation_interval_minutes).toBe(15);
  await db.query(`UPDATE broker_connections SET ibkr_last_confirmation_sync_at=NOW(),
    next_scheduled_sync=NOW()+INTERVAL '1 day', broker_metadata='{"ibkr_backfill_retry":{"reference_code":"ACTIVITY"}}' WHERE id=$1`, [connection_id]);
  await BrokerConnection.update(connection_id, { ibkr_confirmation_interval_minutes: 60 });
  const after = await BrokerConnection.findById(connection_id);
  expect(after.ibkr_confirmation_interval_minutes).toBe(60);
  expect(new Date(after.ibkr_next_confirmation_sync_at) - new Date(after.ibkr_last_confirmation_sync_at)).toBe(60 * 60000);
  expect(after.ibkrBackfillRetry).toEqual({ reference_code: 'ACTIVITY' });
  const activity_due = after.nextScheduledSync;
  await BrokerConnection.updateConfirmationSync(connection_id, { success: true });
  const success = await BrokerConnection.findById(connection_id);
  expect(new Date(success.ibkr_next_confirmation_sync_at) - new Date(success.ibkr_last_confirmation_sync_at)).toBe(60 * 60000);
  expect(success.nextScheduledSync).toEqual(activity_due);
  const reconnect = await BrokerConnection.create(user_id, { brokerType: 'ibkr', ibkrFlexToken: 'renewed', ibkrFlexQueryId: 'first' });
  expect(reconnect.ibkr_confirmation_interval_minutes).toBe(60);
  await expect(db.query('UPDATE broker_connections SET ibkr_confirmation_interval_minutes=10 WHERE id=$1', [connection_id])).rejects.toThrow(/check constraint/);
  await BrokerConnection.update(connection_id, { ibkr_confirmation_interval_minutes: 240 });
  await BrokerConnection.updateConfirmationSync(connection_id, { error: Object.assign(new Error('Slow report'), { transient: true }) });
  const retry = await BrokerConnection.findById(connection_id);
  expect(new Date(retry.ibkr_next_confirmation_sync_at) - Date.now()).toBeGreaterThan(239 * 60000);
});


test.each(require('../../../tests/fixtures/trading-calculation-contracts.json').ibkr_confirmation_schedule_cases)(
  'schedules the next check after the shared $interval_minutes minute interval', async ({ interval_minutes }) => {
    await BrokerConnection.update(connection_id, { ibkr_confirmation_interval_minutes: interval_minutes });
    await BrokerConnection.updateConfirmationSync(connection_id, { success: true });
    const connection = await BrokerConnection.findById(connection_id);
    expect(new Date(connection.ibkr_next_confirmation_sync_at) - new Date(connection.ibkr_last_confirmation_sync_at)).toBe(interval_minutes * 60000);
  }
);
