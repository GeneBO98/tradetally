jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/models/PlaidSecurity', () => ({
  hasSchema: jest.fn(),
  upsertMany: jest.fn()
}));

jest.mock('../../src/services/holdingsService', () => ({
  recalculateHolding: jest.fn()
}));

jest.mock('../../src/services/plaid/plaidClient', () => ({
  getInvestmentHoldings: jest.fn()
}));

const db = require('../../src/config/database');
const PlaidSecurity = require('../../src/models/PlaidSecurity');
const HoldingsService = require('../../src/services/holdingsService');
const plaidClient = require('../../src/services/plaid/plaidClient');
const plaidHoldingsSyncService = require('../../src/services/plaid/plaidHoldingsSyncService');

const connection = {
  id: 'conn-1',
  userId: 'user-1',
  accessToken: 'access-token',
  institutionName: 'Sandbox Brokerage'
};

function buildAccountMap(accounts = [{ id: 'row-1', plaidAccountId: 'acct-1', linkedAccountId: null, mask: '1234' }]) {
  return new Map(accounts.map(account => [account.plaidAccountId, account]));
}

function security(overrides = {}) {
  return {
    security_id: 'sec-aapl',
    ticker_symbol: 'AAPL',
    name: 'Apple Inc',
    type: 'equity',
    is_cash_equivalent: false,
    ...overrides
  };
}

function holding(overrides = {}) {
  return {
    account_id: 'acct-1',
    security_id: 'sec-aapl',
    quantity: 10,
    institution_price: 200,
    cost_basis: 1500,
    ...overrides
  };
}

/**
 * Routes db.query calls by SQL fragment so each test can express intent
 * without mocking call order.
 */
function routeQueries(routes) {
  db.query.mockImplementation(async (sql, params) => {
    for (const [fragment, handler] of routes) {
      if (sql.includes(fragment)) {
        return typeof handler === 'function' ? handler(sql, params) : handler;
      }
    }
    return { rows: [], rowCount: 0 };
  });
}

const defaultRoutes = (overrides = []) => [
  ...overrides,
  ['SELECT account_identifier FROM user_accounts', { rows: [{ account_identifier: 'linked-acct' }] }],
  ['SELECT id, holding_id FROM investment_lots', { rows: [] }],
  ['INSERT INTO investment_holdings', { rows: [{ id: 'holding-1' }] }],
  ['SELECT id FROM investment_holdings', { rows: [{ id: 'holding-1' }] }],
  ['INSERT INTO investment_lots', { rows: [], rowCount: 1 }],
  ['UPDATE investment_lots', { rows: [], rowCount: 1 }],
  ['DELETE FROM investment_lots', { rows: [], rowCount: 0 }],
  ['SELECT COUNT(*) AS count FROM investment_lots', { rows: [{ count: '1' }] }],
  ['DELETE FROM investment_holdings', { rows: [], rowCount: 1 }]
];

function callsMatching(fragment) {
  return db.query.mock.calls.filter(([sql]) => sql.includes(fragment));
}

describe('plaidHoldingsSyncService.syncHoldings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PlaidSecurity.hasSchema.mockResolvedValue(true);
    PlaidSecurity.upsertMany.mockResolvedValue(1);
    HoldingsService.recalculateHolding.mockResolvedValue();
  });

  it('creates a holding and a plaid lot for a new position', async () => {
    plaidClient.getInvestmentHoldings.mockResolvedValue({
      holdings: [holding()],
      securities: [security()]
    });
    routeQueries(defaultRoutes());

    const result = await plaidHoldingsSyncService.syncHoldings(connection, buildAccountMap());

    expect(result).toEqual({ upserted: 1, removed: 0, skipped: 0 });

    const lotInserts = callsMatching('INSERT INTO investment_lots');
    expect(lotInserts).toHaveLength(1);
    const [, params] = lotInserts[0];
    // holding_id, user_id, shares, cost_per_share, total_cost, broker, account_identifier, notes, external_id
    expect(params[0]).toBe('holding-1');
    expect(params[1]).toBe('user-1');
    expect(params[2]).toBe(10);
    expect(params[3]).toBe(150);
    expect(params[4]).toBe(1500);
    expect(params[5]).toBe('Sandbox Brokerage');
    expect(params[8]).toBe('acct-1:sec-aapl');

    expect(HoldingsService.recalculateHolding).toHaveBeenCalledWith('user-1', 'holding-1', { refreshPrice: false });
  });

  it('updates the existing plaid lot in place on re-sync', async () => {
    plaidClient.getInvestmentHoldings.mockResolvedValue({
      holdings: [holding({ quantity: 12, cost_basis: 1900 })],
      securities: [security()]
    });
    routeQueries(defaultRoutes([
      ['SELECT id, holding_id FROM investment_lots', { rows: [{ id: 'lot-1', holding_id: 'holding-1' }] }]
    ]));

    const result = await plaidHoldingsSyncService.syncHoldings(connection, buildAccountMap());

    expect(result.upserted).toBe(1);
    expect(callsMatching('INSERT INTO investment_lots')).toHaveLength(0);
    const updates = callsMatching('UPDATE investment_lots');
    expect(updates).toHaveLength(1);
    const [, params] = updates[0];
    expect(params[0]).toBe('lot-1');
    expect(params[1]).toBe(12);
    expect(params[3]).toBe(1900);
  });

  it('falls back to market value when cost_basis is missing and flags the estimate', async () => {
    plaidClient.getInvestmentHoldings.mockResolvedValue({
      holdings: [holding({ cost_basis: null })],
      securities: [security()]
    });
    routeQueries(defaultRoutes());

    await plaidHoldingsSyncService.syncHoldings(connection, buildAccountMap());

    const [, params] = callsMatching('INSERT INTO investment_lots')[0];
    expect(params[4]).toBe(2000); // 10 shares * $200 institution price
    expect(params[7]).toMatch(/estimated/i);
  });

  it('uses the linked TradeTally account identifier when the plaid account is linked', async () => {
    plaidClient.getInvestmentHoldings.mockResolvedValue({
      holdings: [holding()],
      securities: [security()]
    });
    routeQueries(defaultRoutes());

    await plaidHoldingsSyncService.syncHoldings(
      connection,
      buildAccountMap([{ id: 'row-1', plaidAccountId: 'acct-1', linkedAccountId: 'ua-1', mask: '1234' }])
    );

    const [, params] = callsMatching('INSERT INTO investment_lots')[0];
    expect(params[6]).toBe('linked-acct');
  });

  it('falls back to institution + mask when unlinked', async () => {
    plaidClient.getInvestmentHoldings.mockResolvedValue({
      holdings: [holding()],
      securities: [security()]
    });
    routeQueries(defaultRoutes());

    await plaidHoldingsSyncService.syncHoldings(connection, buildAccountMap());

    const [, params] = callsMatching('INSERT INTO investment_lots')[0];
    expect(params[6]).toBe('Sandbox Brokerage 1234');
  });

  it('skips cash equivalents, pseudo tickers, tickerless and derivative securities', async () => {
    plaidClient.getInvestmentHoldings.mockResolvedValue({
      holdings: [
        holding({ security_id: 'sec-cash' }),
        holding({ security_id: 'sec-cur' }),
        holding({ security_id: 'sec-bond' }),
        holding({ security_id: 'sec-opt' }),
        holding({ security_id: 'sec-zero', quantity: 0 }),
        holding({ account_id: 'acct-unknown' })
      ],
      securities: [
        security({ security_id: 'sec-cash', ticker_symbol: 'VMFXX', is_cash_equivalent: true }),
        security({ security_id: 'sec-cur', ticker_symbol: 'CUR:USD', type: 'cash' }),
        security({ security_id: 'sec-bond', ticker_symbol: null, type: 'fixed income' }),
        security({ security_id: 'sec-opt', ticker_symbol: 'AAPL260116C00200000', type: 'derivative' }),
        security({ security_id: 'sec-zero' })
      ]
    });
    routeQueries(defaultRoutes());

    const result = await plaidHoldingsSyncService.syncHoldings(connection, buildAccountMap());

    expect(result.upserted).toBe(0);
    expect(result.skipped).toBe(6);
    expect(callsMatching('INSERT INTO investment_lots')).toHaveLength(0);
  });

  it('removes stale plaid lots and deletes the holding when no lots remain', async () => {
    plaidClient.getInvestmentHoldings.mockResolvedValue({
      holdings: [],
      securities: []
    });
    routeQueries(defaultRoutes([
      ['DELETE FROM investment_lots', { rows: [{ holding_id: 'holding-gone' }], rowCount: 1 }],
      ['SELECT COUNT(*) AS count FROM investment_lots', { rows: [{ count: '0' }] }]
    ]));

    const result = await plaidHoldingsSyncService.syncHoldings(connection, buildAccountMap());

    expect(result.removed).toBe(1);
    expect(callsMatching('DELETE FROM investment_holdings')).toHaveLength(1);
    expect(HoldingsService.recalculateHolding).not.toHaveBeenCalled();
  });

  it('keeps the holding and recalculates when a manual lot remains after removal', async () => {
    plaidClient.getInvestmentHoldings.mockResolvedValue({
      holdings: [],
      securities: []
    });
    routeQueries(defaultRoutes([
      ['DELETE FROM investment_lots', { rows: [{ holding_id: 'holding-1' }], rowCount: 1 }],
      ['SELECT COUNT(*) AS count FROM investment_lots', { rows: [{ count: '1' }] }]
    ]));

    const result = await plaidHoldingsSyncService.syncHoldings(connection, buildAccountMap());

    expect(result.removed).toBe(1);
    expect(callsMatching('DELETE FROM investment_holdings')).toHaveLength(0);
    expect(HoldingsService.recalculateHolding).toHaveBeenCalledWith('user-1', 'holding-1', { refreshPrice: false });
  });

  it('returns zeros without calling Plaid when the schema is missing', async () => {
    PlaidSecurity.hasSchema.mockResolvedValue(false);

    const result = await plaidHoldingsSyncService.syncHoldings(connection, buildAccountMap());

    expect(result).toEqual({ upserted: 0, removed: 0, skipped: 0 });
    expect(plaidClient.getInvestmentHoldings).not.toHaveBeenCalled();
  });
});
