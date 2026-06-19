// Real-Postgres integration test for migration 211 (backfill option metadata
// from OCC symbols, issue #339). globalSetup already applied the migration to
// the scratch database; these tests insert rows shaped like the historical
// corruption and re-run the migration SQL directly to prove it repairs them
// and is idempotent.
//
// Note: check_options_fields (migration 056) forces strike/expiration/type/
// underlying NOT NULL on option rows, so the realistic corruption shape is an
// EMPTY-STRING underlying_symbol - it satisfies the constraint but the
// grouping code treats it as missing.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const db = require('../../src/config/database');

const MIGRATION_SQL = fs.readFileSync(
  path.join(__dirname, '../../migrations/211_backfill_option_metadata.sql'),
  'utf8'
);

async function createTestUser() {
  const suffix = randomUUID().slice(0, 8);
  const result = await db.query(
    `INSERT INTO users (email, username, password_hash, is_verified, is_active, admin_approved, role)
     VALUES ($1, $2, 'integration-test-hash', true, true, true, 'user')
     RETURNING *`,
    [`int-backfill-${suffix}@example.com`, `int_backfill_${suffix}`]
  );
  return result.rows[0];
}

async function insertTrade(userId, fields = {}) {
  const trade = {
    symbol: 'MRVL260220P00065000',
    instrument_type: 'option',
    underlying_symbol: '',
    option_type: 'put',
    strike_price: 65,
    expiration_date: '2026-02-20',
    side: 'long',
    quantity: 1,
    entry_price: 1.5,
    entry_time: '2026-01-08T15:00:00Z',
    trade_date: '2026-01-08',
    ...fields
  };
  const result = await db.query(
    `INSERT INTO trades (
       user_id, symbol, instrument_type, underlying_symbol, option_type,
       strike_price, expiration_date, side, quantity, entry_price,
       entry_time, trade_date
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      userId, trade.symbol, trade.instrument_type, trade.underlying_symbol,
      trade.option_type, trade.strike_price, trade.expiration_date, trade.side,
      trade.quantity, trade.entry_price, trade.entry_time, trade.trade_date
    ]
  );
  return result.rows[0].id;
}

async function fetchTrade(id) {
  const result = await db.query(
    `SELECT symbol, underlying_symbol, option_type,
            strike_price::float as strike_price,
            to_char(expiration_date, 'YYYY-MM-DD') as expiration_date
     FROM trades WHERE id = $1`,
    [id]
  );
  return result.rows[0];
}

describe('migration 211: option metadata backfill (real database)', () => {
  let user;

  beforeAll(async () => {
    user = await createTestUser();
  });

  afterAll(async () => {
    if (user) {
      await db.query('DELETE FROM users WHERE id = $1', [user.id]);
    }
    await db.pool.end();
  });

  test('fills empty underlying from compact and space-padded OCC symbols without touching symbol', async () => {
    const compactId = await insertTrade(user.id, { symbol: 'MRVL260220P00065000' });
    const paddedId = await insertTrade(user.id, {
      symbol: 'SEDG  250801C00025500',
      option_type: 'call',
      strike_price: 25.5,
      expiration_date: '2025-08-01'
    });

    await db.query(MIGRATION_SQL);

    const compact = await fetchTrade(compactId);
    expect(compact.symbol).toBe('MRVL260220P00065000');
    expect(compact.underlying_symbol).toBe('MRVL');
    // Pre-existing fields survive untouched.
    expect(compact.option_type).toBe('put');
    expect(compact.strike_price).toBeCloseTo(65, 4);
    expect(compact.expiration_date).toBe('2026-02-20');

    const padded = await fetchTrade(paddedId);
    expect(padded.underlying_symbol).toBe('SEDG');
    expect(padded.strike_price).toBeCloseTo(25.5, 4);
  });

  test('normalizes underlying casing on rows with full metadata', async () => {
    const id = await insertTrade(user.id, {
      symbol: 'SNOW260116P00400000',
      underlying_symbol: 'snow ',
      strike_price: 400,
      expiration_date: '2026-01-16'
    });

    await db.query(MIGRATION_SQL);

    const row = await fetchTrade(id);
    expect(row.underlying_symbol).toBe('SNOW');
    expect(row.strike_price).toBeCloseTo(400, 4);
  });

  test('leaves unparseable symbols and non-option rows alone', async () => {
    // Symbol is the bare underlying ticker (the post-migration-201 Schwab
    // convention, and the shape left by the old CUSIP rewrite): nothing to
    // parse, the empty underlying stays empty for runtime healing.
    const tickerId = await insertTrade(user.id, { symbol: 'MRVL' });
    // CUSIP-shaped symbol: also unparseable.
    const cusipId = await insertTrade(user.id, { symbol: '57364U107' });
    // Stock row with an OCC-looking symbol must never be parsed.
    const stockId = await insertTrade(user.id, {
      symbol: 'AAPL230120C00150000',
      instrument_type: 'stock',
      underlying_symbol: null,
      option_type: null,
      strike_price: null,
      expiration_date: null
    });

    await db.query(MIGRATION_SQL);

    expect((await fetchTrade(tickerId)).underlying_symbol).toBe('');
    expect((await fetchTrade(cusipId)).underlying_symbol).toBe('');
    const stock = await fetchTrade(stockId);
    expect(stock.underlying_symbol).toBeNull();
    expect(stock.option_type).toBeNull();
    expect(stock.strike_price).toBeNull();
  });

  test('is idempotent', async () => {
    const id = await insertTrade(user.id, {
      symbol: 'AMD   251010C00240000',
      option_type: 'call',
      strike_price: 240,
      expiration_date: '2025-10-10'
    });

    await db.query(MIGRATION_SQL);
    const first = await fetchTrade(id);
    await db.query(MIGRATION_SQL);
    const second = await fetchTrade(id);

    expect(second).toEqual(first);
    expect(first.underlying_symbol).toBe('AMD');
  });
});
