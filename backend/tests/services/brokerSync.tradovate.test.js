jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));

jest.mock('../../src/models/Trade', () => ({ create: jest.fn() }));
jest.mock('../../src/models/BrokerConnection', () => ({
  updateSyncLog: jest.fn(),
  updateStatus: jest.fn(),
  updateOAuthTokens: jest.fn()
}));
jest.mock('../../src/services/brokerSync/ibkrService', () => ({
  getExistingContext: jest.fn(),
  importTrades: jest.fn()
}));
jest.mock('../../src/services/analyticsCache', () => ({ invalidate: jest.fn() }));
jest.mock('../../src/services/optionStrategyGroupingService', () => ({ rebuildUserGroupsSafe: jest.fn() }));
jest.mock('../../src/utils/cache', () => ({ data: {}, del: jest.fn() }));
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const axios = require('axios');
const BrokerConnection = require('../../src/models/BrokerConnection');
const ibkrService = require('../../src/services/brokerSync/ibkrService');
const tradovateService = require('../../src/services/brokerSync/tradovateService');

const connection = {
  id: 'conn-1',
  userId: 'user-1',
  brokerType: 'tradovate',
  brokerEnvironment: 'demo',
  oauthAccessToken: 'token',
  oauthTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
};

function mockTradovateApi({ fills, orders, accounts, fees = [], products }) {
  const contracts = [
    { id: 11, name: 'MESZ6', contractMaturityId: 21 },
    { id: 12, name: 'XYZZ6', contractMaturityId: 22 }
  ];
  const maturities = [
    { id: 21, productId: 31 },
    { id: 22, productId: 32 }
  ];
  const productList = products || [
    { id: 31, name: 'MES', valuePerPoint: 5, tickSize: 0.25, description: 'Micro E-mini S&P 500' },
    { id: 32, name: 'XYZ', valuePerPoint: 7, tickSize: 0.5, description: 'Unlisted product' }
  ];
  const pick = (list, params) => {
    const ids = String(params.ids).split(',').map(Number);
    return list.filter(item => ids.includes(item.id));
  };

  axios.get.mockImplementation(async (url, { params = {} } = {}) => {
    const path = url.replace(/^https:\/\/[^/]+\/v1/, '');
    switch (path) {
      case '/fill/list': return { data: fills };
      case '/account/list': return { data: accounts };
      case '/order/items': return { data: pick(orders, params) };
      case '/contract/items': return { data: pick(contracts, params) };
      case '/contractMaturity/items': return { data: pick(maturities, params) };
      case '/fillFee/items': return { data: pick(fees, params) };
      case '/product/item': return { data: productList.find(product => product.id === Number(params.id)) };
      default: throw new Error(`Unexpected Tradovate request ${url}`);
    }
  });
}

const fill = (id, orderId, action, qty, price, timestamp, contractId = 11) => ({
  id, orderId, contractId, action, qty, price, timestamp, active: true
});

describe('Tradovate broker sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ibkrService.getExistingContext.mockResolvedValue({ existingPositions: {}, existingOpenPositions: [], existingExecutions: {} });
    ibkrService.importTrades.mockImplementation(async (_userId, trades) => ({ imported: trades.length, updated: 0, duplicates: 0, failed: 0 }));
  });

  test('aggregates partial fills per order with VWAP price and summed fees', async () => {
    mockTradovateApi({
      accounts: [{ id: 1, name: 'APEX-1001' }],
      orders: [{ id: 100, accountId: 1 }],
      fills: [
        fill(1, 100, 'Buy', 1, 7000, '2026-09-10T14:00:00Z'),
        fill(2, 100, 'Buy', 3, 7001, '2026-09-10T14:00:01Z')
      ],
      fees: [
        { id: 1, commission: 0.5, exchangeFee: 0.35 },
        { id: 2, commission: 1.5, exchangeFee: 1.05, nfaFee: 0.06 }
      ]
    });

    const { records, pointValueByProduct, fillCount } = await tradovateService.fetchOrderRecords('token', connection);

    expect(fillCount).toBe(2);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      orderId: '100',
      Contract: 'MESZ6',
      Product: 'MES',
      'B/S': 'Buy',
      filledQty: 4,
      Account: 'APEX-1001',
      'Fill Time': '2026-09-10T14:00:00Z'
    });
    expect(records[0].avgPrice).toBeCloseTo(7000.75, 8);
    expect(records[0].Commission).toBeCloseTo(3.46, 8);
    expect(pointValueByProduct).toEqual({ MES: 5 });
  });

  test('builds futures round trips per account using the API point value', async () => {
    mockTradovateApi({
      accounts: [{ id: 1, name: 'APEX-1001' }, { id: 2, name: 'APEX-1002' }],
      orders: [
        { id: 100, accountId: 1 }, { id: 101, accountId: 1 },
        { id: 200, accountId: 2 }, { id: 201, accountId: 2 }
      ],
      fills: [
        fill(1, 100, 'Buy', 1, 7000, '2026-09-10T14:00:00Z'),
        fill(2, 200, 'Sell', 2, 7002, '2026-09-10T14:00:30Z'),
        fill(3, 101, 'Sell', 1, 7005, '2026-09-10T14:05:00Z'),
        fill(4, 201, 'Buy', 2, 7001, '2026-09-10T14:06:00Z')
      ]
    });

    const result = await tradovateService.syncTrades(connection, { syncLogId: 'log-1' });
    const trades = ibkrService.importTrades.mock.calls[0][1];

    expect(result.imported).toBe(2);
    expect(trades).toHaveLength(2);
    const byAccount = Object.fromEntries(trades.map(trade => [trade.accountIdentifier, trade]));
    expect(byAccount['APEX-1001']).toMatchObject({
      symbol: 'MESZ6', side: 'long', broker: 'tradovate', brokerConnectionId: 'conn-1',
      instrumentType: 'future', pointValue: 5, entryPrice: 7000, exitPrice: 7005
    });
    expect(byAccount['APEX-1001'].pnl).toBeCloseTo(25, 8);
    expect(byAccount['APEX-1002']).toMatchObject({ side: 'short', quantity: 2 });
    expect(byAccount['APEX-1002'].pnl).toBeCloseTo(10, 8);
    expect(BrokerConnection.updateSyncLog).toHaveBeenCalledWith('log-1', 'parsing', { tradesFetched: 4 });
  });

  test('uses valuePerPoint for products missing from the static futures table', async () => {
    mockTradovateApi({
      accounts: [{ id: 1, name: 'ACC' }],
      orders: [{ id: 100, accountId: 1 }, { id: 101, accountId: 1 }],
      fills: [
        fill(1, 100, 'Buy', 1, 100, '2026-09-10T14:00:00Z', 12),
        fill(2, 101, 'Sell', 1, 102, '2026-09-10T14:05:00Z', 12)
      ]
    });

    await tradovateService.syncTrades(connection, {});
    const [trade] = ibkrService.importTrades.mock.calls[0][1];

    expect(trade).toMatchObject({ symbol: 'XYZZ6', pointValue: 7 });
    expect(trade.pnl).toBeCloseTo(14, 8);
  });

  test('closes an open position from an earlier sync instead of opening a reversed trade', async () => {
    ibkrService.getExistingContext.mockResolvedValue({
      existingPositions: {},
      existingOpenPositions: [{
        id: 'trade-open', symbol: 'MESZ6', side: 'long', quantity: 1, entryPrice: 7000,
        entryTime: '2026-09-09T14:00:00Z', tradeDate: '2026-09-09', commission: 0,
        broker: 'tradovate', instrumentType: 'future', accountIdentifier: 'ACC',
        executions: [{ action: 'buy', quantity: 1, price: 7000, datetime: '2026-09-09T14:00:00Z', orderId: '99' }]
      }],
      existingExecutions: {}
    });
    mockTradovateApi({
      accounts: [{ id: 1, name: 'ACC' }],
      orders: [{ id: 101, accountId: 1 }],
      fills: [fill(3, 101, 'Sell', 1, 7004, '2026-09-10T14:05:00Z')]
    });

    await tradovateService.syncTrades(connection, {});
    const [trade] = ibkrService.importTrades.mock.calls[0][1];

    expect(trade).toMatchObject({ side: 'long', isUpdate: true, existingTradeId: 'trade-open', exitPrice: 7004 });
    expect(trade.executionData).toHaveLength(2);
  });

  test('filters fills outside the sync window', async () => {
    mockTradovateApi({
      accounts: [{ id: 1, name: 'ACC' }],
      orders: [{ id: 100, accountId: 1 }],
      fills: [fill(1, 100, 'Buy', 1, 7000, '2026-08-01T14:00:00Z')]
    });

    const { records } = await tradovateService.fetchOrderRecords('token', connection, { startDate: '2026-09-01' });
    expect(records).toEqual([]);
  });

  describe('token handling', () => {
    test('renews an expiring token that has no refresh token', async () => {
      axios.get.mockResolvedValue({ data: { accessToken: 'renewed', expirationTime: '2026-09-10T16:00:00Z' } });

      const result = await tradovateService.ensureValidToken({
        ...connection,
        oauthTokenExpiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString()
      });

      expect(result).toEqual({ accessToken: 'renewed', needsReauth: false });
      expect(axios.get.mock.calls[0][0]).toBe('https://demo.tradovateapi.com/v1/auth/renewaccesstoken');
      expect(BrokerConnection.updateOAuthTokens).toHaveBeenCalledWith('conn-1', 'renewed', null, new Date('2026-09-10T16:00:00Z'), null);
    });

    test('asks the user to reconnect once the token has expired', async () => {
      const result = await tradovateService.ensureValidToken({
        ...connection,
        oauthTokenExpiresAt: new Date(Date.now() - 60 * 1000).toISOString()
      });

      expect(result).toEqual({ accessToken: null, needsReauth: true });
      expect(axios.get).not.toHaveBeenCalled();
      expect(BrokerConnection.updateStatus).toHaveBeenCalledWith('conn-1', 'expired', expect.stringContaining('reconnect'));
    });

    test('marks the connection expired when the API rejects the token', async () => {
      axios.get.mockRejectedValue(Object.assign(new Error('Unauthorized'), { response: { status: 401 } }));

      await expect(tradovateService.syncTrades(connection, {})).rejects.toThrow('Tradovate authentication expired');
      expect(BrokerConnection.updateStatus).toHaveBeenCalledWith('conn-1', 'expired', expect.any(String));
    });

    test('flags rate limits as transient so the scheduler retries', async () => {
      axios.get.mockRejectedValue(Object.assign(new Error('Too many requests'), { response: { status: 429 } }));

      await expect(tradovateService.syncTrades(connection, {})).rejects.toMatchObject({ transient: true });
    });
  });

  test('is only offered when partner credentials are configured', () => {
    expect(typeof tradovateService.isConfigured()).toBe('boolean');
    expect(tradovateService.config.authorizationUrl).toBe('https://trader.tradovate.com/oauth');
  });
});
