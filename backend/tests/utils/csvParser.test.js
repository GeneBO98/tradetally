const { parseCSV, parseDateTime } = require('../../src/utils/csvParser');

describe('csvParser timezone handling', () => {
  test('preserves explicit timezone offsets instead of dropping them', () => {
    expect(parseDateTime('03/09/2026 16:29:00 +02:00')).toBe('2026-03-09T16:29:00+02:00');
    expect(parseDateTime('2026-03-09T16:29:00+0100')).toBe('2026-03-09T16:29:00+01:00');
  });

  test('converts TradingView performance local timestamps using the user timezone', async () => {
    const csv = [
      'symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration',
      'NASDAQ:AAPL,100,price,0.01,1,2,1,100,101,1,"03/09/2026 16:29:00","03/09/2026 16:45:00","16m"'
    ].join('\n');

    const result = await parseCSV(Buffer.from(csv), 'tradingview_performance', {
      userTimezone: 'Europe/Berlin'
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].entryTime).toBe('2026-03-09T15:29:00Z');
    expect(result.trades[0].exitTime).toBe('2026-03-09T15:45:00Z');
    expect(result.trades[0].tradeDate).toBe('2026-03-09');
  });
});
