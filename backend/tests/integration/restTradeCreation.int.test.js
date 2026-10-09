// Real HTTP/auth/model/SQL coverage for issue #401. The scratch database is
// mandatory; market data and achievement side effects are irrelevant here.
jest.mock('../../src/utils/symbolCategories', () => ({ getSymbolCategory: jest.fn().mockResolvedValue(null) }));
jest.mock('../../src/services/achievementService', () => ({
  checkAndAwardAchievements: jest.fn().mockResolvedValue([]),
  updateTradingStreak: jest.fn().mockResolvedValue(null)
}));

const request = require('supertest');
const { randomUUID } = require('crypto');
const db = require('../../src/config/database');
const Trade = require('../../src/models/Trade');
const TierService = require('../../src/services/tierService');
const { app } = require('../../src/server');
const { generateToken } = require('../../src/middleware/auth');

const base_trade = {
  symbol: 'AAPL', side: 'long', quantity: 10, entryPrice: 100,
  entryTime: '2026-06-01T14:30:00Z', exitPrice: 105,
  exitTime: '2026-06-01T15:30:00Z', strategy: 'day_trading',
  commission: 1, fees: 0.25, account_identifier: 'account-a'
};

describe('REST trade retry protection (real database)', () => {
  let user;
  let other_user;
  let token;

  async function create_user() {
    const suffix = randomUUID().slice(0, 8);
    const result = await db.query(
      `INSERT INTO users (email, username, password_hash, is_verified, is_active, admin_approved)
       VALUES ($1, $2, 'test-hash', true, true, true) RETURNING *`,
      [`int-401-${suffix}@example.com`, `int_401_${suffix}`]
    );
    return result.rows[0];
  }

  function post(path, body, key, auth_token = token) {
    const pending = request(app).post(path).set('Authorization', `Bearer ${auth_token}`);
    if (key) pending.set('Idempotency-Key', key);
    return pending.send(body);
  }

  beforeAll(async () => {
    jest.spyOn(Trade, 'checkNewsForTrade').mockResolvedValue({});
    jest.spyOn(TierService, 'getUserTier').mockResolvedValue('free');
    user = await create_user();
    other_user = await create_user();
    token = generateToken(user);
  });

  beforeEach(async () => {
    await db.query('DELETE FROM trades WHERE user_id = ANY($1::uuid[])', [[user.id, other_user.id]]);
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [[user?.id, other_user?.id].filter(Boolean)]);
    await db.pool.end();
  });

  test('concurrent retries with changed or absent keys insert exactly once', async () => {
    const responses = await Promise.all(Array.from({ length: 5 }, (_, index) =>
      post('/api/v1/trades', base_trade, index ? randomUUID() : undefined)
    ));
    expect(responses.map(res => res.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(responses.map(res => res.body.trade.id)).size).toBe(1);
    expect(responses.filter(res => res.body.duplicate)).toHaveLength(4);
    const rows = await db.query('SELECT pnl FROM trades WHERE user_id = $1', [user.id]);
    expect(rows.rows).toHaveLength(1);
    expect(Number(rows.rows[0].pnl)).toBeCloseTo(48.75);
  });

  test('replanned overlapping batches and duplicates within a batch keep totals stable', async () => {
    const trades = ['AAPL', 'MSFT', 'NVDA'].map(symbol => ({ ...base_trade, symbol }));
    const first = await post('/api/v1/trades/bulk', { trades: [trades[0], trades[1], trades[0]] }, randomUUID());
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ created: 2, duplicates: 1, failed: 0 });
    const retries = await Promise.all([
      post('/api/v1/trades/bulk', { trades: [trades[2], trades[1]] }, randomUUID()),
      post('/api/v1/trades/bulk', { trades: [trades[1], trades[0], trades[2]] }, randomUUID())
    ]);
    expect(retries.every(res => res.status === 200)).toBe(true);
    expect(retries.reduce((sum, res) => sum + res.body.created, 0)).toBe(1);
    expect(retries.reduce((sum, res) => sum + res.body.duplicates, 0)).toBe(4);
    expect(retries.every(res => res.body.failed === 0)).toBe(true);
    const result = await db.query('SELECT count(*)::int AS count, sum(pnl) AS pnl FROM trades WHERE user_id = $1', [user.id]);
    expect(result.rows[0].count).toBe(3);
    expect(Number(result.rows[0].pnl)).toBeCloseTo(146.25);
  });

  test('matches pre-existing rows, timestamp offsets and database numeric precision without supplied P&L', async () => {
    const payload = { ...base_trade, entryPrice: 100.12345678, quantity: 10.12345678 };
    const existing = await Trade.create(user.id, payload, { skipApiCalls: true, skipAchievements: true });
    const retry = await post('/api/v1/trades', {
      ...payload, symbol: 'aapl', entryTime: '2026-06-01T09:30:00-05:00', notes: 'Retry metadata'
    });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ duplicate: true, trade: { id: existing.id } });
    expect(retry.body.trade.notes).not.toBe('Retry metadata');
  });

  test('open trades and zero-price exits are protected', async () => {
    for (const exit of [{ exitTime: null, exitPrice: null }, { exitTime: base_trade.exitTime, exitPrice: 0 }]) {
      const first = await post('/api/v1/trades', { ...base_trade, ...exit });
      const retry = await post('/api/v1/trades', { ...base_trade, ...exit });
      expect(first.status).toBe(201);
      expect(retry.status).toBe(200);
      expect(retry.body.trade.id).toBe(first.body.trade.id);
    }
  });

  test('keeps distinct accounts, users, sides, quantities, times and contracts', async () => {
    const variations = [
      base_trade,
      { ...base_trade, account_identifier: 'account-b' },
      { ...base_trade, broker: 'another-broker' },
      { ...base_trade, side: 'short' },
      { ...base_trade, quantity: 20 },
      { ...base_trade, entryTime: '2026-06-01T14:30:01Z' },
      { ...base_trade, instrumentType: 'option', optionType: 'call', strikePrice: 100, expirationDate: '2026-07-17' },
      { ...base_trade, instrumentType: 'option', optionType: 'call', strikePrice: 110, expirationDate: '2026-07-17' },
      { ...base_trade, instrumentType: 'option', optionType: 'put', strikePrice: 100, expirationDate: '2026-07-17' },
      { ...base_trade, instrumentType: 'option', optionType: 'call', strikePrice: 100, expirationDate: '2026-08-21' }
    ];
    for (const payload of variations) {
      const response = await post('/api/v1/trades', payload.instrumentType === 'option'
        ? { ...payload, underlyingSymbol: 'AAPL' } : payload);
      expect(response.status).toBe(201);
    }
    const other_response = await post('/api/v1/trades', base_trade, undefined, generateToken(other_user));
    expect(other_response.status).toBe(201);
    const rows = await db.query('SELECT id FROM trades WHERE user_id = $1', [user.id]);
    expect(rows.rows).toHaveLength(variations.length);
  });
});
