/**
 * CSV Parser Trade Grouping Tests
 * Tests applyTradeGrouping() directly
 */

jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn().mockReturnValue(null), set: jest.fn(), del: jest.fn(), data: {} }));
jest.mock('../../src/utils/cusipQueue', () => ({ addToQueue: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({
  convertTradeToUSD: jest.fn(trade => trade),
  userHasProAccess: jest.fn().mockResolvedValue(false)
}));

const { applyTradeGrouping } = require('../../src/utils/csvParser');

function makeTrade(overrides = {}) {
  return {
    symbol: 'AAPL',
    tradeDate: '2025-01-01',
    entryTime: '2025-01-01T09:30:00',
    exitTime: '2025-01-01T10:00:00',
    entryPrice: 150,
    exitPrice: 155,
    quantity: 100,
    side: 'long',
    commission: 1,
    fees: 0.5,
    pnl: 500,
    instrumentType: 'stock',
    ...overrides
  };
}

describe('applyTradeGrouping', () => {
  const settings = { enabled: true, timeGapMinutes: 60 };

  test('returns empty array for empty input', () => {
    expect(applyTradeGrouping([], settings)).toEqual([]);
    expect(applyTradeGrouping(null, settings)).toBeNull();
  });

  test('groups trades within time gap', () => {
    const trades = [
      makeTrade({ entryTime: '2025-01-01T09:30:00', quantity: 50, entryPrice: 150, pnl: 200 }),
      makeTrade({ entryTime: '2025-01-01T09:45:00', quantity: 50, entryPrice: 152, pnl: 300 })
    ];
    const result = applyTradeGrouping(trades, settings);
    expect(result).toHaveLength(1);
    expect(result[0].quantity).toBe(100);
    expect(result[0].groupedTrades).toBe(2);
  });

  test('keeps trades separate when outside time gap', () => {
    const trades = [
      makeTrade({ entryTime: '2025-01-01T09:30:00' }),
      makeTrade({ entryTime: '2025-01-01T11:00:00' }) // 90 min gap > 60 min setting
    ];
    const result = applyTradeGrouping(trades, settings);
    expect(result).toHaveLength(2);
  });

  test('does not group different symbols', () => {
    const trades = [
      makeTrade({ symbol: 'AAPL', entryTime: '2025-01-01T09:30:00' }),
      makeTrade({ symbol: 'MSFT', entryTime: '2025-01-01T09:35:00' })
    ];
    const result = applyTradeGrouping(trades, settings);
    expect(result).toHaveLength(2);
  });

  test('keeps different option strikes separate', () => {
    const trades = [
      makeTrade({
        symbol: 'AAPL',
        instrumentType: 'option',
        strikePrice: 150,
        expirationDate: '2025-01-20',
        optionType: 'call',
        entryTime: '2025-01-01T09:30:00'
      }),
      makeTrade({
        symbol: 'AAPL',
        instrumentType: 'option',
        strikePrice: 160,
        expirationDate: '2025-01-20',
        optionType: 'call',
        entryTime: '2025-01-01T09:35:00'
      })
    ];
    const result = applyTradeGrouping(trades, settings);
    expect(result).toHaveLength(2);
  });

  test('calculates weighted average entry price', () => {
    const trades = [
      makeTrade({ entryTime: '2025-01-01T09:30:00', quantity: 100, entryPrice: 150, pnl: 200 }),
      makeTrade({ entryTime: '2025-01-01T09:35:00', quantity: 100, entryPrice: 160, pnl: 300 })
    ];
    const result = applyTradeGrouping(trades, settings);
    expect(result).toHaveLength(1);
    // Weighted avg: (150*100 + 160*100) / 200 = 155
    expect(result[0].entryPrice).toBeCloseTo(155, 1);
  });

  test('aggregates commission and fees', () => {
    const trades = [
      makeTrade({ entryTime: '2025-01-01T09:30:00', commission: 1.50, fees: 0.25, pnl: 100 }),
      makeTrade({ entryTime: '2025-01-01T09:35:00', commission: 2.00, fees: 0.50, pnl: 200 })
    ];
    const result = applyTradeGrouping(trades, settings);
    expect(result).toHaveLength(1);
    expect(result[0].commission).toBeCloseTo(3.50, 2);
    expect(result[0].fees).toBeCloseTo(0.75, 2);
  });

  test('does not group trades with different sides', () => {
    const trades = [
      makeTrade({ entryTime: '2025-01-01T09:30:00', side: 'long', pnl: 100 }),
      makeTrade({ entryTime: '2025-01-01T09:35:00', side: 'short', pnl: 200 })
    ];
    const result = applyTradeGrouping(trades, settings);
    expect(result).toHaveLength(2);
  });
});
