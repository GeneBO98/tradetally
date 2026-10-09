jest.mock('../../src/services/tierService', () => ({}));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/alphaVantage', () => ({}));
jest.mock('../../src/utils/databento', () => ({}));
jest.mock('../../src/services/replayDataService', () => ({}));
jest.mock('axios', () => ({}));

const ChartService = require('../../src/services/chartService');

describe('ChartService trade price alignment', () => {
  test('serves stock candles in the recorded fill price space', () => {
    const entryTime = '2025-01-02T14:30:00.000Z';
    const chartData = {
      candles: [{
        time: Date.parse(entryTime) / 1000,
        open: 936,
        high: 940,
        low: 932,
        close: 938,
        volume: 100
      }]
    };

    ChartService.alignCandlesToTradePrices(chartData, {
      instrument_type: 'stock',
      entry_time: entryTime,
      entry_price: 39.11
    });

    expect(chartData.price_scale).toBe(24);
    expect(chartData.candles[0]).toMatchObject({
      open: 39,
      close: 938 / 24,
      volume: 2400
    });
  });

  test('does not compare option contract fills with underlying candles', () => {
    const candles = [{ time: 100, open: 500, high: 501, low: 499, close: 500, volume: 100 }];
    const chartData = { candles };

    ChartService.alignCandlesToTradePrices(chartData, {
      instrument_type: 'option',
      entry_time: '1970-01-01T00:01:40.000Z',
      entry_price: 2.5
    });

    expect(chartData.price_scale).toBe(1);
    expect(chartData.candles).toBe(candles);
  });
});
