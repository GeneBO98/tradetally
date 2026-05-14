jest.mock('axios', () => ({
  get: jest.fn()
}));

jest.mock('../../src/utils/csvParser', () => ({
  parseCSV: jest.fn()
}));

jest.mock('../../src/models/Trade', () => ({
  create: jest.fn()
}));

jest.mock('../../src/models/BrokerConnection', () => ({
  updateSyncLog: jest.fn(),
  updateSchwabTokens: jest.fn(),
  updateStatus: jest.fn()
}));

jest.mock('../../src/services/analyticsCache', () => ({
  invalidateUserCache: jest.fn()
}));

jest.mock('../../src/utils/cache', () => ({
  data: {},
  del: jest.fn()
}));

jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const Trade = require('../../src/models/Trade');
const db = require('../../src/config/database');
const ibkrService = require('../../src/services/brokerSync/ibkrService');
const schwabService = require('../../src/services/brokerSync/schwabService');

describe('broker sync duplicate protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('IBKR importTrades skips a duplicate trade repeated within the same sync batch', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    Trade.create.mockResolvedValue({ id: 'trade-1' });

    const trade = {
      symbol: 'AAPL',
      side: 'long',
      quantity: 10,
      entryPrice: 100,
      entryTime: '2026-03-06T15:00:00Z',
      tradeDate: '2026-03-06',
      executionData: [
        {
          datetime: '2026-03-06T15:00:00Z',
          quantity: 10,
          type: 'entry'
        }
      ]
    };

    const result = await ibkrService.importTrades('user-1', [trade, { ...trade }], {});

    expect(Trade.create).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      imported: 1,
      duplicates: 1,
      failed: 0
    });
  });

  test('IBKR existing trade lookup is scoped to the incoming sync date range', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await ibkrService.getExistingTradesForDuplicateCheck('user-1', [
      { tradeDate: '2026-03-05' },
      { entryTime: '2026-03-07T12:30:00Z' }
    ]);

    const [query, params] = db.query.mock.calls[0];
    expect(query).toContain('trade_date >= $2');
    expect(query).toContain('trade_date <= $3');
    expect(query).not.toContain('LIMIT 1000');
    expect(params).toEqual(['user-1', '2026-03-05', '2026-03-07']);
  });

  test('IBKR duplicate detection falls back to closed-trade fields when executions do not match', () => {
    const isDuplicate = ibkrService.isDuplicateTrade(
      {
        symbol: 'AAPL',
        side: 'long',
        quantity: 10,
        entryPrice: 100,
        exitPrice: 104,
        pnl: 40,
        entryTime: '2026-03-06T15:00:00Z',
        tradeDate: '2026-03-06',
        executionData: [
          { datetime: '2026-03-06T15:00:05Z', quantity: 10, price: 100, action: 'buy' }
        ]
      },
      [
        {
          symbol: 'AAPL',
          side: 'long',
          quantity: 10,
          entry_price: 100,
          exit_price: 104,
          pnl: 40,
          entry_time: '2026-03-06T15:00:00Z',
          trade_date: '2026-03-06',
          instrument_type: 'stock',
          executions: [
            { datetime: '2026-03-06T15:10:00Z', quantity: 10, price: 104, action: 'sell' }
          ]
        }
      ],
      {}
    );

    expect(isDuplicate).toBe(true);
  });

  test('IBKR execution matching uses order IDs when they are present', () => {
    expect(
      ibkrService.executionsMatch(
        { orderId: 'abc123', datetime: '2026-03-06T15:00:00Z', quantity: 5, price: 100 },
        { orderId: 'abc123', datetime: '2026-03-06T15:30:00Z', quantity: 5, price: 101 }
      )
    ).toBe(true);
  });

  test('IBKR Flex request never sends fd/td date overrides', () => {
    const params = ibkrService.buildReportRequestParams('token-1', 'query-1', {
      syncType: 'manual',
      startDate: '2025-01-01',
      endDate: '2026-01-01'
    });

    expect(params).toEqual({
      t: 'token-1',
      q: 'query-1',
      v: '3'
    });
    expect(params).not.toHaveProperty('fd');
    expect(params).not.toHaveProperty('td');
  });

  test('Schwab importTrades skips a trade already imported by a previous sync', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          symbol: 'AAPL',
          side: 'long',
          quantity: 5,
          entry_price: 100,
          exit_price: 105,
          entry_time: '2026-03-06T14:30:00Z',
          exit_time: '2026-03-06T15:00:00Z',
          trade_date: '2026-03-06',
          pnl: 25,
          instrument_type: 'stock',
          executions: [
            {
              datetime: '2026-03-06T15:00:00Z',
              type: 'exit',
              orderId: 'exit-123'
            }
          ]
        }
      ]
    });

    const result = await schwabService.importTrades('user-1', 'conn-1', [
      {
        symbol: 'AAPL',
        side: 'long',
        quantity: 5,
        entryPrice: 100,
        exitPrice: 105,
        entryTime: '2026-03-06T14:30:00Z',
        exitTime: '2026-03-06T15:00:00Z',
        tradeDate: '2026-03-06',
        pnl: 25,
        instrumentType: 'stock',
        executionData: [
          {
            datetime: '2026-03-06T15:00:00Z',
            type: 'exit',
            orderId: 'exit-123'
          }
        ]
      }
    ]);

    expect(Trade.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      imported: 0,
      duplicates: 1,
      failed: 0
    });
  });

  test('Schwab existing trade lookup is scoped to the incoming sync date range', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });

    await schwabService.getExistingTrades('user-1', [
      { tradeDate: '2026-03-05' },
      { exitTime: '2026-03-08T09:15:00Z' }
    ]);

    const [query, params] = db.query.mock.calls[0];
    expect(query).toContain('trade_date >= $2');
    expect(query).toContain('trade_date <= $3');
    expect(query).not.toContain('LIMIT 5000');
    expect(params).toEqual(['user-1', '2026-03-05', '2026-03-08']);
  });

  test('Schwab parseTransactions uses intraday time for same-day partial exits', () => {
    const schwabTrade = ({ orderId, tradeDate, time, price, amount, positionEffect, netAmount }) => ({
      type: 'TRADE',
      orderId,
      tradeDate,
      time,
      netAmount,
      transferItems: [
        {
          instrument: {
            assetType: 'EQUITY',
            symbol: 'AUUD'
          },
          price,
          amount,
          positionEffect
        }
      ]
    });

    const trades = schwabService.parseTransactions([
      // Deliberately first in API order. With date-only tradeDate ordering this
      // was treated as an unmatched short close and used netAmount as P&L.
      schwabTrade({
        orderId: '1006105171805',
        tradeDate: '2026-04-23',
        time: '2026-04-23T14:31:40Z',
        price: 7.47,
        amount: -50,
        positionEffect: 'CLOSING',
        netAmount: 373.5
      }),
      schwabTrade({
        orderId: '1006105171703',
        tradeDate: '2026-04-23',
        time: '2026-04-23T14:05:48Z',
        price: 6.84,
        amount: 100,
        positionEffect: 'OPENING',
        netAmount: -684
      }),
      schwabTrade({
        orderId: '1006105171794',
        tradeDate: '2026-04-23',
        time: '2026-04-23T14:30:45Z',
        price: 7.00,
        amount: -50,
        positionEffect: 'CLOSING',
        netAmount: 350
      })
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: 'AUUD',
      side: 'long',
      quantity: 100,
      entryPrice: 6.84,
      exitPrice: 7.235,
      pnl: 39.5
    });
  });
});
