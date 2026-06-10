jest.mock('../../src/utils/databento', () => ({
  isConfigured: jest.fn(),
  getFuturesCandles: jest.fn()
}));

jest.mock('../../src/utils/finnhub', () => ({
  getCandles: jest.fn()
}));

const databento = require('../../src/utils/databento');
const finnhub = require('../../src/utils/finnhub');
const MAEEstimator = require('../../src/utils/maeEstimator');

describe('MAEEstimator futures data provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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

  test('does not fall back to Finnhub for futures when Databento is missing', async () => {
    databento.isConfigured.mockReturnValue(false);

    await expect(MAEEstimator.calculateFromCandleData({
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
    })).rejects.toThrow('Databento API key not configured');

    expect(finnhub.getCandles).not.toHaveBeenCalled();
  });
});
