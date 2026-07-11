jest.mock('axios', () => ({ get: jest.fn() }));

jest.mock('../../src/models/Trade', () => ({ create: jest.fn() }));
jest.mock('../../src/models/BrokerConnection', () => ({
  updateSyncLog: jest.fn(),
  updateStatus: jest.fn()
}));
jest.mock('../../src/services/analyticsCache', () => ({ invalidate: jest.fn() }));
jest.mock('../../src/services/optionStrategyGroupingService', () => ({
  rebuildUserGroupsSafe: jest.fn()
}));
jest.mock('../../src/utils/cache', () => ({ data: {}, del: jest.fn() }));
jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const axios = require('axios');
const trading212Service = require('../../src/services/brokerSync/trading212Service');

function historyItem({
  id,
  ticker = 'AAPL_US_EQ',
  side = 'BUY',
  quantity = 2,
  price = 100,
  filledAt = '2026-07-01T14:30:00Z',
  taxes = []
}) {
  return {
    fill: {
      id,
      type: 'TRADE',
      quantity,
      price,
      filledAt,
      walletImpact: {
        currency: 'USD',
        fxRate: 1,
        taxes
      }
    },
    order: {
      id: `order-${id}`,
      side,
      ticker,
      currency: 'USD',
      instrument: { ticker, currency: 'USD' }
    }
  };
}

describe('Trading 212 broker sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('validates credentials against the selected environment', async () => {
    axios.get.mockResolvedValue({ data: { id: 12345678, currency: 'GBP' } });

    const result = await trading212Service.validateCredentials('key', 'secret', 'demo');

    expect(result).toEqual(expect.objectContaining({
      valid: true,
      accountId: '12345678',
      currency: 'GBP'
    }));
    expect(axios.get).toHaveBeenCalledWith(
      'https://demo.trading212.com/api/v0/equity/account/summary',
      expect.objectContaining({ auth: { username: 'key', password: 'secret' } })
    );
  });

  test('paginates historical orders and applies the requested date window', async () => {
    axios.get
      .mockResolvedValueOnce({
        data: {
          items: [
            historyItem({ id: 3, filledAt: '2026-07-03T14:30:00Z' }),
            historyItem({ id: 2, filledAt: '2026-07-02T14:30:00Z' })
          ],
          nextPagePath: '/api/v0/equity/history/orders?limit=50&cursor=2'
        },
        headers: { 'x-ratelimit-remaining': '5' }
      })
      .mockResolvedValueOnce({
        data: {
          items: [historyItem({ id: 1, filledAt: '2026-06-30T14:30:00Z' })],
          nextPagePath: null
        },
        headers: { 'x-ratelimit-remaining': '4' }
      });

    const items = await trading212Service.fetchExecutions({
      brokerEnvironment: 'live',
      trading212ApiKey: 'key',
      trading212ApiSecret: 'secret',
      externalAccountId: '12345678'
    }, {
      startDate: '2026-07-01',
      endDate: '2026-07-02'
    });

    expect(items).toHaveLength(1);
    expect(items[0].fill.id).toBe(2);
    expect(items[0]._accountIdentifier).toBe('****5678');
    expect(axios.get.mock.calls[1][0]).toBe(
      'https://live.trading212.com/api/v0/equity/history/orders?limit=50&cursor=2'
    );
  });

  test('maps fills, normalizes tickers, and pairs buy/sell executions', () => {
    const trades = trading212Service.mapExecutionsToTrades([
      historyItem({
        id: 10,
        ticker: 'VUSA_GB_EQ',
        side: 'BUY',
        quantity: 1.5,
        price: 80,
        filledAt: '2026-07-01T09:00:00Z',
        taxes: [{ name: 'COMMISSION_TURNOVER', amount: 0.1 }]
      }),
      historyItem({
        id: 11,
        ticker: 'VUSA_GB_EQ',
        side: 'SELL',
        quantity: 1.5,
        price: 84,
        filledAt: '2026-07-02T09:00:00Z',
        taxes: [{ name: 'STAMP_DUTY', amount: 0.2 }]
      })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: 'VUSA',
      side: 'long',
      quantity: 1.5,
      entryPrice: 80,
      exitPrice: 84,
      tradeDate: '2026-07-02',
      commission: 0.1,
      fees: 0.2,
      originalCurrency: 'USD',
      exchangeRate: 1
    });
    expect(trades[0].executionData[0]).toMatchObject({
      order_id: '10',
      commission: 0.1,
      fx_rate: 1
    });
  });

  test('ignores non-trade corporate-action fills', () => {
    const item = historyItem({ id: 20 });
    item.fill.type = 'STOCK_SPLIT';
    expect(trading212Service.mapExecutionToFill(item)).toBeNull();
  });
});
