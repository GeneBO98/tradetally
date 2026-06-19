// Real-Postgres integration test for the CSV import pipeline (issue #340
// broke at exactly this layer: HTTP upload → parse → dedupe → insert →
// status). Runs the real Express app, real auth middleware, real SQL.
const request = require('supertest');
const { randomUUID } = require('crypto');

const db = require('../../src/config/database');
const { app } = require('../../src/server');
const { generateToken } = require('../../src/middleware/auth');

const TRADESTATION_CSV = [
  'Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time,Comm,SEC,TAF,NSCC,Nasdaq,ECN Remove,ECN Add,Gross Proceeds,Net Proceeds,Clr Broker,Liq,Note',
  '12345,4/30/26,5/1/26,USD,2,B,HCAI,100,11.02,7:35:46,0.99,0,0,0.03,0.01,0,0,-1102.00,-1103.03,VIRTU,1,',
  '12345,4/30/26,5/1/26,USD,2,S,HCAI,100,11.61,7:51:52,0.99,0.01,0.01,0.03,0.01,0,0,1161.00,1158.95,VIRTU,1,'
].join('\n');

async function createTestUser() {
  const suffix = randomUUID().slice(0, 8);
  const result = await db.query(
    `INSERT INTO users (email, username, password_hash, is_verified, is_active, admin_approved, role)
     VALUES ($1, $2, 'integration-test-hash', true, true, true, 'user')
     RETURNING *`,
    [`int-import-${suffix}@example.com`, `int_import_${suffix}`]
  );
  const user = result.rows[0];
  await db.query('INSERT INTO user_settings (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);
  return user;
}

async function waitForImport(token, importId, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastLog = null;

  while (Date.now() < deadline) {
    const res = await request(app)
      .get(`/api/trades/import/status/${importId}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    lastLog = res.body.importLog;

    if (lastLog.status === 'completed' || lastLog.status === 'failed') {
      return lastLog;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  throw new Error(`Import ${importId} did not finish in ${timeoutMs}ms (last status: ${lastLog?.status})`);
}

describe('CSV import pipeline (TradeStation, real database)', () => {
  let user;
  let token;

  beforeAll(async () => {
    user = await createTestUser();
    token = generateToken(user);
  });

  afterAll(async () => {
    if (user) {
      await db.query('DELETE FROM users WHERE id = $1', [user.id]);
    }
    await db.pool.end();
  });

  test('rejects the import without authentication', async () => {
    const res = await request(app)
      .post('/api/trades/import')
      .attach('file', Buffer.from(TRADESTATION_CSV), 'trades.csv')
      .field('broker', 'tradestation');

    expect(res.status).toBe(401);
  });

  test('imports a TradeStation round trip end to end', async () => {
    const res = await request(app)
      .post('/api/trades/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(TRADESTATION_CSV), 'trades.csv')
      .field('broker', 'tradestation');

    expect(res.status).toBe(202);
    expect(res.body.importId).toBeDefined();

    const importLog = await waitForImport(token, res.body.importId);
    expect(importLog.status).toBe('completed');

    // The round trip landed in the database with the right economics.
    const trades = await db.query(
      'SELECT * FROM trades WHERE user_id = $1 ORDER BY entry_time',
      [user.id]
    );
    expect(trades.rows).toHaveLength(1);

    const trade = trades.rows[0];
    expect(trade.symbol).toBe('HCAI');
    expect(trade.side).toBe('long');
    expect(parseFloat(trade.quantity)).toBe(100);
    expect(parseFloat(trade.entry_price)).toBeCloseTo(11.02, 4);
    expect(parseFloat(trade.exit_price)).toBeCloseTo(11.61, 4);
    expect(trade.import_id).toBe(res.body.importId);
    // Gross P&L is $59; commissions ($1.98) and exchange fees ($0.10) come out.
    expect(parseFloat(trade.pnl)).toBeCloseTo(56.92, 2);
    expect(parseFloat(trade.commission)).toBeCloseTo(1.98, 2);

    // The trade list API serves it back.
    const listRes = await request(app)
      .get('/api/trades')
      .set('Authorization', `Bearer ${token}`);
    expect(listRes.status).toBe(200);
    const listTrades = listRes.body.trades || listRes.body;
    expect(listTrades.some(t => t.symbol === 'HCAI')).toBe(true);

    // Analytics agree with the stored trade (cache was invalidated by import).
    const analyticsRes = await request(app)
      .get('/api/trades/analytics')
      .set('Authorization', `Bearer ${token}`);
    expect(analyticsRes.status).toBe(200);
    expect(analyticsRes.body.summary.totalTrades).toBe(1);
    expect(analyticsRes.body.summary.winningTrades).toBe(1);
    expect(analyticsRes.body.summary.totalPnL).toBeCloseTo(parseFloat(trade.pnl), 2);
  });

  test('re-importing the same file does not create duplicate trades', async () => {
    const res = await request(app)
      .post('/api/trades/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(TRADESTATION_CSV), 'trades.csv')
      .field('broker', 'tradestation');

    expect(res.status).toBe(202);
    const importLog = await waitForImport(token, res.body.importId);
    expect(importLog.status).toBe('completed');

    const trades = await db.query(
      'SELECT id FROM trades WHERE user_id = $1',
      [user.id]
    );
    expect(trades.rows).toHaveLength(1);
  });
});
