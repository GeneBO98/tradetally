jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn().mockReturnValue(null), set: jest.fn(), del: jest.fn(), data: {} }));
jest.mock('../../src/utils/cusipQueue', () => ({ addToQueue: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({
  convertTradeToUSD: jest.fn(trade => trade),
  userHasProAccess: jest.fn().mockResolvedValue(false)
}));

const { parseCSV } = require('../../src/utils/csvParser');

test('TradingView order history identifies forex and its P&L quote currency', async () => {
  const csv = [
    'Symbol,Side,Type,Quantity,Fill price,Commission,Placing time,Closing time,Order ID,Leverage',
    'BLACKBULL:EURUSD,Buy,Market,100000,1.10000,,2026-09-01 09:00:00,2026-09-01 09:00:00,1,100:1',
    'BLACKBULL:EURUSD,Sell,Market,100000,1.10100,,2026-09-01 10:00:00,2026-09-01 10:00:00,2,',
    'BLACKBULL:EURAUD,Buy,Market,100000,1.60000,,2026-09-02 09:00:00,2026-09-02 09:00:00,3,100:1',
    'BLACKBULL:EURAUD,Sell,Market,100000,1.60100,,2026-09-02 10:00:00,2026-09-02 10:00:00,4,',
    'BLACKBULL:EURJPY,Buy,Market,100000,160.000,,2026-09-03 09:00:00,2026-09-03 09:00:00,5,100:1',
    'BLACKBULL:EURJPY,Sell,Market,100000,160.100,,2026-09-03 10:00:00,2026-09-03 10:00:00,6,'
  ].join('\n');

  const result = await parseCSV(Buffer.from(csv), 'tradingview', {
    tradeGroupingSettings: { enabled: false }
  });

  expect(result.trades).toHaveLength(3);
  const bySymbol = Object.fromEntries(result.trades.map(trade => [trade.symbol, trade]));
  expect(bySymbol['BLACKBULL:EURUSD']).toMatchObject({
    instrumentType: 'forex', underlyingAsset: 'EUR', originalCurrency: 'USD',
    currencyConversionRequired: false
  });
  expect(bySymbol['BLACKBULL:EURUSD'].pnl).toBeCloseTo(100);
  expect(bySymbol['BLACKBULL:EURAUD']).toMatchObject({
    instrumentType: 'forex', originalCurrency: 'AUD', currencyConversionRequired: true
  });
  expect(bySymbol['BLACKBULL:EURAUD'].pnl).toBeCloseTo(100);
  expect(bySymbol['BLACKBULL:EURJPY']).toMatchObject({
    instrumentType: 'forex', originalCurrency: 'JPY', currencyConversionRequired: true
  });
  expect(bySymbol['BLACKBULL:EURJPY'].pnl).toBeCloseTo(10000);
});
