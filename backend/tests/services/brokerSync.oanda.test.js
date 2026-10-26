jest.mock('axios', () => ({ get: jest.fn() }));
jest.mock('../../src/models/Trade', () => ({ create: jest.fn(), update: jest.fn() }));
jest.mock('../../src/models/BrokerConnection', () => ({ updateSyncLog: jest.fn() }));
jest.mock('../../src/services/analyticsCache', () => ({ invalidate: jest.fn() }));
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({ getForexRate: jest.fn() }));
jest.mock('../../src/utils/timezone', () => ({ getUserTimezone: jest.fn().mockResolvedValue('UTC') }));

const axios = require('axios');
const service = require('../../src/services/brokerSync/oandaService');
const Trade = require('../../src/models/Trade');
const db = require('../../src/config/database');
const AnalyticsCache = require('../../src/services/analyticsCache');
const { computeTradePnl } = require('../../src/services/pnlEngine');
const fixtures = require('../../../tests/fixtures/trading-calculation-contracts.json').oanda_sync_cases;
const converter = require('../../src/utils/currencyConverter');
const connection = {
  id: 'connection', userId: 'user', oanda_api_token: 'secret-test-token',
  externalAccountId: '101-001-123456-001', brokerEnvironment: 'practice', brokerMetadata: { currency: 'GBP' }
};
const clone = value => JSON.parse(JSON.stringify(value));

beforeEach(() => {
  jest.clearAllMocks();
  db.query.mockResolvedValue({ rows: [] });
});

test.each(fixtures)('maps $id with broker P&L, allocated costs and original prices', async fixture => {
  const transaction = async id => fixture.transactions.find(item => item.id === String(id));
  const rate = async (currency, date) => currency === 'USD' ? 1 : fixture.rates[`${currency}:${date}`];
  const result = await service.map_trade(fixture.snapshot,
    { ...connection, brokerMetadata: { currency: fixture.account_currency } },
    new Map([[fixture.instrument.name, fixture.instrument]]), transaction, rate, 'UTC');
  for (const [key, value] of Object.entries(fixture.expected)) {
    if (key === 'gross_pnl') {
      expect(result.executions.reduce((sum, leg) => sum + (leg.gross_realized_pnl || 0), 0)).toBeCloseTo(value, 8);
    } else if (typeof value === 'number') expect(result[key]).toBeCloseTo(value, 8);
    else expect(result[key]).toBe(value);
  }
  expect(result.original_entry_price_currency).toBe(Number(fixture.snapshot.price));
  expect(result.account_identifier).toBe('oanda:practice:101-001-123456-001');
  expect(result.broker_trade_id).toBe(fixture.snapshot.id);
});

test('edited economics no longer use a stale broker P&L report', () => {
  const execution = {
    entry_price: 1, exit_price: 2, quantity: 10, side: 'long',
    entry_time: '2026-10-01T12:00:00Z', exit_time: '2026-10-02T12:00:00Z',
    broker_pnl: { source: 'oanda', entry_price: 1, exit_price: 1.5, quantity: 10, side: 'long', gross_pnl: 4 }
  };
  expect(computeTradePnl({ side: 'long', executions: [execution] }).aggregate.pnl).toBe(10);
});

test('does not net a hedged short into another trade in the same instrument', async () => {
  const fixture = fixtures[1];
  const transaction = async id => fixture.transactions.find(item => item.id === String(id));
  const instruments = new Map([[fixture.instrument.name, fixture.instrument]]);
  const first = await service.map_trade(fixture.snapshot, { ...connection, brokerMetadata: { currency: 'USD' } }, instruments, transaction, async () => 1, 'UTC');
  expect(first.side).toBe('short');
  expect(first.quantity).toBe(2);
  expect(first.executions).toHaveLength(2);
  expect(first.executions[1].quantity).toBe(1.5);
});

test('rejects incomplete closing history instead of inventing an open balance', async () => {
  const fixture = fixtures[0];
  const snapshot = { ...fixture.snapshot, closingTransactionIDs: [] };
  await expect(service.map_trade(snapshot, connection, new Map([[fixture.instrument.name, fixture.instrument]]),
    async () => fixture.transactions[0], async () => 1, 'UTC')).rejects.toThrow('incomplete');
});

test('paginates all trade states and keeps bearer tokens in headers', async () => {
  axios.get.mockResolvedValueOnce({ data: { trades: [{ id: '20' }] }, headers: { link: '</v3/accounts/101-001-123456-001/trades?state=ALL&beforeID=20>; rel="next"' } })
    .mockResolvedValueOnce({ data: { trades: [{ id: '10' }] }, headers: {} });
  const trades = await service.fetch_trades(connection);
  expect(trades.map(trade => trade.id)).toEqual(['20', '10']);
  expect(axios.get.mock.calls[0][0]).toContain('state=ALL');
  expect(axios.get.mock.calls[0][1]).toMatchObject({ headers: { Authorization: 'Bearer secret-test-token' }, maxRedirects: 0 });
  expect(axios.get.mock.calls.every(([url]) => !url.includes('secret-test-token'))).toBe(true);
});

test('rejects cross-origin pagination before sending a token', async () => {
  axios.get.mockResolvedValueOnce({ data: { trades: [] }, headers: { link: '<https://untrusted.example/v3/accounts/101-001-123456-001/trades>; rel="next"' } });
  await expect(service.fetch_trades(connection)).rejects.toThrow('invalid API URL');
  expect(axios.get).toHaveBeenCalledTimes(1);
});

test('sanitizes authentication errors and never retains the Axios request', async () => {
  axios.get.mockRejectedValueOnce({ response: { status: 401 }, config: { headers: { Authorization: 'secret-test-token' } } });
  try {
    await service.request('secret-test-token', 'practice', '/v3/accounts');
    throw new Error('request should fail');
  } catch (error) {
    expect(error.message).toContain('rejected access');
    expect(error.config).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain('secret-test-token');
  }
});

function mock_sync(fixture) {
  const snapshot = clone(fixture.snapshot);
  axios.get.mockImplementation(async url => {
    if (url.endsWith('/summary')) return { data: { account: { id: connection.externalAccountId, currency: fixture.account_currency } } };
    if (url.endsWith('/instruments')) return { data: { instruments: [fixture.instrument] } };
    if (url.includes('/trades?')) return { data: { trades: [snapshot] }, headers: {} };
    const id = url.split('/').at(-1);
    return { data: { transaction: fixture.transactions.find(item => item.id === id) } };
  });
  converter.getForexRate.mockImplementation(async (currency, target, date) => fixture.rates[`${currency}:${date}`]);
  return snapshot;
}

test('imports, skips repeated snapshots, then updates the original trade after a change', async () => {
  const fixture = fixtures[0];
  const snapshot = mock_sync(fixture);
  let saved;
  Trade.create.mockImplementation(async (user, data) => {
    saved = { id: 'stored-trade', broker_trade_id: '10', executions: data.executions };
    return saved;
  });
  db.query.mockImplementation(async sql => ({ rows: sql.includes('SELECT id, broker_trade_id') && saved ? [clone(saved)] : [] }));
  expect((await service.syncTrades(connection)).imported).toBe(1);
  expect((await service.syncTrades(connection)).duplicates).toBe(1);
  expect(Trade.create).toHaveBeenCalledTimes(1);
  snapshot.financing = '-0.8';
  expect((await service.syncTrades(connection)).updated).toBe(1);
  expect(Trade.update).toHaveBeenCalledWith('stored-trade', 'user', expect.objectContaining({ broker_trade_id: '10', fees: 1 }), expect.any(Object));
  expect(AnalyticsCache.invalidate).toHaveBeenCalledTimes(2);
  expect(db.query.mock.calls.some(([sql]) => sql.includes('quality_backfill'))).toBe(true);
});

test('date floors filter closed trades but retain older open positions', async () => {
  mock_sync(fixtures[0]);
  expect((await service.syncTrades(connection, { startDate: '2026-10-03' })).skipped).toBe(1);
  expect(Trade.create).not.toHaveBeenCalled();
  mock_sync(fixtures[1]);
  expect((await service.syncTrades(connection, { startDate: '2026-10-03' })).imported).toBe(1);
});

test('retries a rate-limited read after the requested delay', async () => {
  jest.useFakeTimers();
  try {
    axios.get.mockRejectedValueOnce({ response: { status: 429, headers: { 'retry-after': '1' } } })
      .mockResolvedValueOnce({ data: { accounts: [] } });
    const pending = service.list_accounts('test-token', 'practice');
    await jest.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual([]);
    expect(axios.get).toHaveBeenCalledTimes(2);
  } finally { jest.useRealTimers(); }
});
