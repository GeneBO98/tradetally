// These tests execute the model's real SQL against session-local tables. The
// Queries are read-only and search only pg_temp. A write transaction is used
// solely to create the temporary fixture tables; no persistent data is used.
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const { Client } = require('pg');
const db = require('../../src/config/database');
const Account = require('../../src/models/Account');

describe('account cashflow (real PostgreSQL, temporary fixtures)', () => {
  const userId = '00000000-0000-4000-8000-000000000001';
  const accountId = '00000000-0000-4000-8000-000000000002';
  let client;
  let account;

  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
    if (!/test/i.test(new URL(process.env.TEST_DATABASE_URL).pathname)) {
      throw new Error('Account cashflow regressions require a disposable test database');
    }
    client = new Client({
      connectionString: process.env.TEST_DATABASE_URL,
      options: '-c default_transaction_read_only=on -c search_path=pg_temp -c timezone=UTC'
    });
    await client.connect();
    // PostgreSQL requires a write transaction even for CREATE TEMP TABLE.
    await client.query('BEGIN READ WRITE');
    await client.query(`CREATE TEMP TABLE trades (
      id uuid DEFAULT gen_random_uuid(), user_id uuid, account_identifier varchar,
      symbol varchar DEFAULT 'MES', side varchar DEFAULT 'short',
      instrument_type varchar DEFAULT 'future', quantity numeric DEFAULT 1,
      entry_price numeric DEFAULT 7855.50, exit_price numeric,
      trade_date date DEFAULT '2026-10-12',
      entry_time timestamptz DEFAULT '2026-10-12 18:45:33+00', exit_time timestamptz,
      point_value numeric DEFAULT 5, contract_size numeric,
      commission numeric DEFAULT 0, entry_commission numeric, exit_commission numeric,
      fees numeric DEFAULT 0, pnl numeric, is_simulated boolean DEFAULT false
    )`);
    await client.query(`CREATE TEMP TABLE account_transactions (
      id uuid DEFAULT gen_random_uuid(), user_id uuid, account_id uuid,
      transaction_type varchar, amount numeric, transaction_date date,
      description text, source_type varchar, created_at timestamptz DEFAULT now()
    )`);
    await client.query('COMMIT');
    db.query.mockImplementation((sql, params) => client.query(sql, params));
    jest.spyOn(Account, 'findById').mockImplementation(async () => account);
  });

  beforeEach(async () => {
    await client.query('DELETE FROM pg_temp.trades');
    await client.query('DELETE FROM pg_temp.account_transactions');
    account = {
      id: accountId, account_name: 'Futures', account_identifier: 'test-account',
      initial_balance: '1000', initial_balance_date: '2026-10-01'
    };
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (client) await client.end();
  });

  async function trade(overrides = {}) {
    const row = { user_id: userId, account_identifier: account.account_identifier, ...overrides };
    const columns = Object.keys(row);
    await client.query(
      `INSERT INTO pg_temp.trades (${columns.join(', ')}) VALUES (${columns.map((_, i) => `$${i + 1}`).join(', ')})`,
      Object.values(row)
    );
  }

  const cashflow = (options = {}) => Account.getCashflow(userId, accountId, {
    endDate: '2026-10-14', ...options
  });
  const activity = (date) => Account.getDayActivity(userId, accountId, date);

  test('reported open MES short cannot credit its $39,277.50 notional to cash', async () => {
    account.initial_balance = '309.36';
    await trade({ commission: 1.7, fees: 31.7 });
    const result = await cashflow();
    expect(result.summary.totalInflow).toBe(0);
    expect(result.summary.totalOutflow).toBeCloseTo(0.85);
    expect(result.summary.currentBalance).toBeCloseTo(308.51);
    expect(result.summary.totalFees).toBeCloseTo(0.85);
    expect((await activity('2026-10-12')).trades[0]).toMatchObject({
      eventType: 'entry', grossAmount: 0, direction: 'outflow', commission: 0.85
    });
  });

  test('open long futures do not spend contract notional either', async () => {
    await trade({ side: 'long', quantity: 2, commission: 4 });
    const result = await cashflow();
    expect(result.summary.currentBalance).toBe(998);
    expect(result.summary.totalTradeOutflow).toBe(2);
  });

  test.each([
    ['long', 1010, 45, 'inflow'], ['long', 990, -55, 'outflow'],
    ['short', 990, 45, 'inflow'], ['short', 1010, -55, 'outflow']
  ])('%s futures settling at %s use realized cash, with net P&L %s', async (side, exitPrice, netPnl, direction) => {
    await trade({ side, entry_price: 1000, exit_price: exitPrice,
      exit_time: '2026-10-13 12:00:00+00', commission: 4, fees: 1, pnl: netPnl });
    const result = await cashflow();
    expect(result.summary.currentBalance).toBe(1000 + netPnl);
    expect(result.summary.totalFees).toBe(5);
    expect(result.cashflow).toHaveLength(2);
    expect(result.cashflow[0].net).toBe(-2);
    expect(result.cashflow[1].net).toBe(netPnl + 2);
    expect((await activity('2026-10-13')).trades[0]).toMatchObject({
      eventType: 'exit', grossAmount: 50, direction, commission: 2
    });
  });

  test('closed futures without stored P&L fall back to price movement and point value', async () => {
    await trade({ entry_price: 1000, exit_price: 990, quantity: 2,
      exit_time: '2026-10-13 12:00:00+00', commission: 4, fees: 1 });
    expect((await cashflow()).summary.currentBalance).toBe(1095);
    expect((await activity('2026-10-13')).trades[0].grossAmount).toBe(100);
  });

  test('stored zero net P&L and explicit per-side commissions are not double charged', async () => {
    await trade({ entry_price: 1000, exit_price: 990, pnl: 0, commission: 8,
      entry_commission: 3, exit_commission: 5, fees: 1,
      exit_time: '2026-10-13 12:00:00+00' });
    const result = await cashflow();
    expect(result.summary.currentBalance).toBe(1000);
    expect(result.summary.totalFees).toBe(9);
    expect(result.cashflow.map(row => row.net)).toEqual([-3, 3]);
    expect((await activity('2026-10-13')).trades[0]).toMatchObject({ grossAmount: 9, commission: 5 });
  });

  test('breakeven futures costs and rebates survive zero-notional entries and exits', async () => {
    await trade({ exit_price: 7855.50, commission: 4, fees: 1,
      exit_time: '2026-10-13 12:00:00+00' });
    await trade({ exit_price: 7855.50, commission: -2,
      exit_time: '2026-10-13 12:00:00+00' });
    const result = await cashflow();
    expect(result.summary.currentBalance).toBe(997);
    expect(result.summary.totalFees).toBe(3);
    expect(result.summary.totalTradeInflow).toBe(2);
    expect(result.summary.totalTradeOutflow).toBe(5);
  });

  test.each([[0, 4], [4, 0], [null, 4]])(
    'keeps a zero commission side when entry=%s and exit=%s',
    async (entryCommission, exitCommission) => {
      await trade({ entry_price: 1000, exit_price: 990, pnl: 45,
        commission: 4, entry_commission: entryCommission, exit_commission: exitCommission, fees: 1,
        exit_time: '2026-10-13 12:00:00+00' });
      const result = await cashflow();
      expect(result.summary.currentBalance).toBe(1045);
      expect(result.summary.totalFees).toBe(5);
      expect((await activity('2026-10-12')).trades[0].commission).toBe(entryCommission || 0);
      expect((await activity('2026-10-13')).trades[0].commission).toBe(exitCommission);
    }
  );

  test('settlement respects exit dates even when entry is outside the report range', async () => {
    await trade({ entry_price: 1000, exit_price: 990, pnl: 45, commission: 4, fees: 1,
      exit_time: '2026-10-13 12:00:00+00' });
    const result = await cashflow({ startDate: '2026-10-13', endDate: '2026-10-13' });
    expect(result.cashflow).toHaveLength(1);
    expect(result.cashflow[0].net).toBe(47);
    expect((await cashflow({ endDate: '2026-10-12' })).cashflow[0].net).toBe(-2);
  });

  test.each(['stock', 'option', 'future'])('simulated %s trades do not affect cash totals or itemized activity', async (instrumentType) => {
    await trade({ instrument_type: instrumentType, is_simulated: true,
      exit_price: 7900, pnl: 200, commission: 4, fees: 1,
      exit_time: '2026-10-13 12:00:00+00' });
    expect((await cashflow()).summary).toMatchObject({
      currentBalance: 1000, totalInflow: 0, totalOutflow: 0, totalFees: 0
    });
    expect((await activity('2026-10-12')).trades).toEqual([]);
    expect((await activity('2026-10-13')).trades).toEqual([]);
  });

  test('stock and option purchase/sale cashflow, deposits and withdrawals retain their values', async () => {
    await trade({ instrument_type: 'stock', side: 'long', entry_price: 10, exit_price: 12,
      quantity: 10, commission: 2, fees: 1, exit_time: '2026-10-13 12:00:00+00' });
    await trade({ instrument_type: 'option', side: 'short', entry_price: 2, exit_price: 1,
      contract_size: 100, commission: 2, fees: 1, exit_time: '2026-10-13 12:00:00+00' });
    await client.query(`INSERT INTO pg_temp.account_transactions
      (user_id, account_id, transaction_type, amount, transaction_date)
      VALUES ($1, $2, 'deposit', 50, '2026-10-12'), ($1, $2, 'withdrawal', 10, '2026-10-13')`, [userId, accountId]);
    expect((await cashflow()).summary).toMatchObject({
      currentBalance: 1154, totalTradeInflow: 318, totalTradeOutflow: 204,
      totalDeposits: 50, totalWithdrawals: 10, totalFees: 6
    });
    expect((await activity('2026-10-12')).trades.map(t => t.grossAmount).sort((a, b) => a - b)).toEqual([100, 200]);
  });

  test('other users and accounts are excluded from both totals and details', async () => {
    await trade({ account_identifier: 'other-account', commission: 4 });
    await trade({ user_id: '00000000-0000-4000-8000-000000000099', commission: 4 });
    await trade({ account_identifier: null, commission: 4 });
    await trade({ commission: 2 });
    expect((await cashflow()).summary.currentBalance).toBe(999);
    expect((await activity('2026-10-12')).trades).toHaveLength(1);
    account.account_identifier = null;
    expect((await cashflow()).summary.currentBalance).toBe(998);
    expect((await activity('2026-10-12')).trades).toHaveLength(1);
  });
});
