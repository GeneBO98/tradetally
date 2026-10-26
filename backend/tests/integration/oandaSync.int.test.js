jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({ getForexRate: jest.fn() }));
const { randomUUID } = require('crypto');
const axios = require('axios');
const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');
const service = require('../../src/services/brokerSync/oandaService');
const converter = require('../../src/utils/currencyConverter');
const fixtures = require('../../../tests/fixtures/trading-calculation-contracts.json').oanda_sync_cases;
const clone = value => JSON.parse(JSON.stringify(value));

let user_id;
let snapshots;
let transactions;
let fixture;
let connection;

beforeAll(async () => {
  user_id = randomUUID();
  await db.query(`INSERT INTO users (id, email, username, password_hash)
    VALUES ($1, $2, $3, 'test-only')`, [user_id, `oanda-${user_id}@example.com`, `oanda_${user_id.slice(0, 8)}`]);
  connection = await BrokerConnection.create(user_id, {
    brokerType: 'oanda', oanda_api_token: 'test-only-token',
    externalAccountId: '101-001-123456-001', brokerEnvironment: 'practice', autoSyncEnabled: false
  });
  connection = await BrokerConnection.findById(connection.id, true);
});

beforeEach(async () => {
  await db.query('DELETE FROM trades WHERE user_id = $1', [user_id]);
  fixture = clone(fixtures[0]);
  snapshots = [fixture.snapshot];
  transactions = [...fixture.transactions];
  converter.getForexRate.mockImplementation(async (currency, target, date) => fixture.rates[`${currency}:${date}`]);
  axios.get.mockImplementation(async url => {
    if (url.endsWith('/summary')) return { data: { account: { id: connection.externalAccountId, currency: fixture.account_currency } } };
    if (url.endsWith('/instruments')) return { data: { instruments: [fixture.instrument] } };
    if (url.includes('/trades?')) return { data: { trades: snapshots }, headers: {} };
    const id = url.split('/').at(-1);
    return { data: { transaction: transactions.find(item => item.id === id) } };
  });
});

afterAll(async () => {
  try { await db.query('DELETE FROM users WHERE id = $1', [user_id]); }
  finally { await db.pool.end(); }
});

test('persists reported USD P&L, deduplicates repeated syncs and updates fees while preserving journal notes', async () => {
  expect(connection.oanda_api_token).toBe('test-only-token');
  const encrypted = await db.query('SELECT oanda_api_token FROM broker_connections WHERE id = $1', [connection.id]);
  expect(encrypted.rows[0].oanda_api_token).not.toContain('test-only-token');
  expect((await service.syncTrades(connection)).imported).toBe(1);
  expect((await service.syncTrades(connection)).duplicates).toBe(1);
  const first = await db.query('SELECT * FROM trades WHERE user_id = $1', [user_id]);
  expect(first.rows).toHaveLength(1);
  const trade = first.rows[0];
  expect(Number(trade.pnl)).toBeCloseTo(5.63, 8);
  expect(Number(trade.entry_price)).toBeCloseTo(1.005, 8);
  expect(Number(trade.original_entry_price_currency)).toBe(150);
  expect(trade.broker_trade_id).toBe('10');
  await db.query('UPDATE trades SET notes = $1 WHERE id = $2', ['Keep my journal notes', trade.id]);
  snapshots[0].financing = '-0.8';
  const result = await service.syncTrades(connection);
  expect(result.updated).toBe(1);
  expect(result.failed).toBe(0);
  const updated = (await db.query('SELECT * FROM trades WHERE id = $1', [trade.id])).rows[0];
  expect(updated.notes).toBe('Keep my journal notes');
  expect(Number(updated.pnl)).toBeCloseTo(5.13, 8);
  expect(Number(updated.fees)).toBeCloseTo(1, 8);
  expect(updated.mae).toBeNull();
  const jobs = await db.query("SELECT type FROM job_queue WHERE user_id = $1 AND type IN ('mae_recalc', 'quality_backfill') AND status = 'pending'", [user_id]);
  expect(jobs.rows.map(job => job.type).sort()).toEqual(['mae_recalc', 'quality_backfill']);
});

test('keeps identical economics from different broker trade IDs as separate trades', async () => {
  snapshots.push({ ...clone(fixture.snapshot), id: '11', closingTransactionIDs: ['21'] });
  transactions.push({ ...clone(transactions[0]), id: '11', tradeOpened: { tradeID: '11', units: '1000' } });
  transactions.push({ ...clone(transactions[1]), id: '21', tradesClosed: [{ ...transactions[1].tradesClosed[0], tradeID: '11' }] });
  expect((await service.syncTrades(connection)).imported).toBe(2);
  expect((await service.syncTrades(connection)).duplicates).toBe(2);
  expect((await db.query('SELECT id FROM trades WHERE user_id = $1', [user_id])).rows).toHaveLength(2);
});

test('updates a partially closed metal trade to fully closed using the same database row', async () => {
  fixture = clone(fixtures[1]);
  snapshots = [fixture.snapshot];
  transactions = [...fixture.transactions];
  expect((await service.syncTrades(connection)).imported).toBe(1);
  let stored = (await db.query('SELECT * FROM trades WHERE user_id = $1', [user_id])).rows[0];
  const id = stored.id;
  expect(stored.instrument_type).toBe('cfd');
  expect(stored.exit_price).toBeNull();
  expect(Number(stored.pnl)).toBeCloseTo(4.25, 8);
  Object.assign(snapshots[0], { state: 'CLOSED', currentUnits: '0', realizedPL: '-10', closeTime: '2026-10-03T12:00:00Z', closingTransactionIDs: ['40', '50'] });
  transactions.push({ id: '50', time: '2026-10-03T12:00:00Z', price: '2010', commission: '1.5', tradesClosed: [{ tradeID: '30', units: '1.5', price: '2010', realizedPL: '-15' }] });
  expect((await service.syncTrades(connection)).updated).toBe(1);
  stored = (await db.query('SELECT * FROM trades WHERE user_id = $1', [user_id])).rows[0];
  expect(stored.id).toBe(id);
  expect(Number(stored.pnl)).toBeCloseTo(-13, 8);
  expect(Number(stored.quantity)).toBe(2);
  expect(Number(stored.exit_price)).toBe(2005);
  expect(stored.executions).toHaveLength(2);
});
