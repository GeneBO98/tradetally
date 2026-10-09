const { resolvePriceScale, applyPriceScale } = require('../../src/utils/candlePriceScale');

describe('candle price scale alignment', () => {
  test('rescales reverse-split-adjusted candles into the historical fill price space', () => {
    const candles = [
      { time: 100, open: 936, high: 940, low: 932, close: 938, volume: 100 },
      { time: 200, open: 938, high: 942, low: 934, close: 939, volume: 120 }
    ];
    const fills = [
      { time: 100, price: 39.11 },
      { time: 200, price: 39.86 }
    ];

    const scale = resolvePriceScale(candles, fills);
    const aligned = applyPriceScale(candles, scale);

    expect(scale).toBe(24);
    expect(aligned[0]).toMatchObject({ open: 39, high: 940 / 24, low: 932 / 24, close: 938 / 24, volume: 2400 });
  });

  test('leaves ordinary candle and fill differences untouched', () => {
    const candles = [{ time: 100, open: 39, high: 40, low: 38, close: 39.5, volume: 100 }];
    const fills = [{ time: 100, price: 39.11 }];

    expect(resolvePriceScale(candles, fills)).toBe(1);
    expect(applyPriceScale(candles, 1)).toBe(candles);
  });
});
