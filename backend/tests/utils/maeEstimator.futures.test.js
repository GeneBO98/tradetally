jest.mock('../../src/utils/databento', () => ({
  isConfigured: jest.fn(),
  getFuturesCandles: jest.fn()
}));

jest.mock('../../src/utils/finnhub', () => ({
  getCandles: jest.fn()
}));

jest.mock('../../src/utils/yahooFinance', () => ({
  isEnabled: jest.fn(),
  getContinuousSymbol: jest.fn(root => `${root}=F`),
  fetchCandles: jest.fn()
}));

const databento = require('../../src/utils/databento');
const finnhub = require('../../src/utils/finnhub');
const yahooFinance = require('../../src/utils/yahooFinance');
const MAEEstimator = require('../../src/utils/maeEstimator');

describe('MAEEstimator futures data provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    yahooFinance.isEnabled.mockReturnValue(true);
  });

  test('uses Databento for futures MAE/MFE when configured', async () => {
    databento.isConfigured.mockReturnValue(true);
    databento.getFuturesCandles.mockResolvedValue([
      { time: Date.parse('2026-05-22T16:25:00Z') / 1000, high: 100.5, low: 99, close: 100 },
      { time: Date.parse('2026-05-22T16:26:00Z') / 1000, high: 103, low: 100, close: 102 }
    ]);

    const result = await MAEEstimator.calculateFromCandleData({
      symbol: 'ESM6',
      instrument_type: 'future',
      underlying_asset: 'ES',
      side: 'long',
      entry_price: 100,
      exit_price: 102,
      entry_time: '2026-05-22T16:25:00Z',
      exit_time: '2026-05-22T16:26:00Z',
      quantity: 2,
      point_value: 50,
      pnl: 200,
      commission: 0,
      fees: 0
    });

    expect(databento.getFuturesCandles).toHaveBeenCalledWith('ES', expect.any(Date), expect.any(Date), 'minute');
    expect(finnhub.getCandles).not.toHaveBeenCalled();
    expect(result.mae).toBe(100);
    expect(result.mfe).toBe(300);
  });

  test('uses Yahoo continuous candles when Databento is missing', async () => {
    databento.isConfigured.mockReturnValue(false);
    yahooFinance.fetchCandles.mockResolvedValue([
      { time: Date.parse('2026-05-22T16:24:00Z') / 1000, high: 200, low: 50, close: 100 },
      { time: Date.parse('2026-05-22T16:25:00Z') / 1000, open: 100, high: 101, low: 99, close: 100 },
      { time: Date.parse('2026-05-22T16:26:00Z') / 1000, open: 100, high: 103, low: 100, close: 102 },
      { time: Date.parse('2026-05-22T16:27:00Z') / 1000, high: 200, low: 50, close: 100 }
    ]);

    const result = await MAEEstimator.calculateFromCandleData({
      symbol: 'ESM6',
      instrument_type: 'future',
      underlying_asset: 'ES',
      side: 'long',
      entry_price: 100,
      exit_price: 102,
      entry_time: '2026-05-22T16:25:00Z',
      exit_time: '2026-05-22T16:26:00Z',
      quantity: 1,
      point_value: 50,
      pnl: 100,
      commission: 0,
      fees: 0
    });

    expect(yahooFinance.fetchCandles).toHaveBeenCalledWith(
      'ES=F', '2026-05-22T16:25:00Z', '2026-05-22T16:26:00Z', '1'
    );
    expect(finnhub.getCandles).not.toHaveBeenCalled();
    expect(result).toEqual({ mae: 50, mfe: 150 });
  });

  test('falls back to Yahoo when configured Databento cannot serve the trade', async () => {
    databento.isConfigured.mockReturnValue(true);
    databento.getFuturesCandles.mockRejectedValue(new Error('temporary Databento outage'));
    yahooFinance.fetchCandles.mockResolvedValue([
      { time: Date.parse('2026-05-22T16:25:00Z') / 1000, open: 100, high: 101, low: 99, close: 100 }
    ]);

    const candles = await MAEEstimator.getCandlesForExcursion({
      symbol: 'ESM6', instrument_type: 'future', underlying_asset: 'ES', entry_price: 100
    }, '2026-05-22T16:25:00Z', '2026-05-22T16:26:00Z');

    expect(yahooFinance.fetchCandles).toHaveBeenCalled();
    expect(candles).toEqual({ h: [101], l: [99], c: [100] });
  });

  test('rejects a Yahoo continuous contract that does not match the traded contract price', async () => {
    databento.isConfigured.mockReturnValue(false);
    yahooFinance.fetchCandles.mockResolvedValue([
      { time: Date.parse('2026-05-22T16:25:00Z') / 1000, open: 110, high: 111, low: 109, close: 110 }
    ]);

    await expect(MAEEstimator.getCandlesForExcursion({
      symbol: 'ESM6', instrument_type: 'future', underlying_asset: 'ES', entry_price: 100
    }, '2026-05-22T16:25:00Z', '2026-05-22T16:26:00Z')).rejects.toThrow(/differs.*10.0%/);
  });
});
