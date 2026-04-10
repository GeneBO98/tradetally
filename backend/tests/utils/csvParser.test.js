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

  test('keeps Tradovate aggregate trade times aligned with execution times', async () => {
    const csv = [
      'orderId,Account,Order ID,B/S,Contract,Product,Product Description,avgPrice,filledQty,Fill Time,lastCommandId,Status,_priceFormat,_priceFormatType,_tickSize,spreadDefinitionId,Version ID,Timestamp,Date,Quantity,Text,Type,Limit Price,Stop Price,decimalLimit,decimalStop,Filled Qty,Avg Fill Price,decimalFillAvg,Venue,Notional Value,Currency',
      '1,,1,Sell,MESH6,MES,Micro E-mini S&P 500,6714,8,03/09/2026 16:29:00,1,Filled,-2,0,0.25,,1,03/09/2026 16:29:00,3/9/26,8,multibracket,Limit,6714,,6714,,8,6714,6714,,268560,USD',
      '2,,2,Buy,MESH6,MES,Micro E-mini S&P 500,6713.75,8,03/09/2026 16:31:05,2,Filled,-2,0,0.25,,2,03/09/2026 16:31:05,3/9/26,8,multibracket,Stop,,6713.75,,6713.75,8,6713.75,6713.75,,268550,USD'
    ].join('\n');

    const result = await parseCSV(Buffer.from(csv), 'tradovate', {
      userTimezone: 'Europe/Berlin'
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].entryTime).toBe('2026-03-09T15:29:00Z');
    expect(result.trades[0].exitTime).toBe('2026-03-09T15:31:05Z');
    expect(result.trades[0].executions[0].datetime).toBe('2026-03-09T15:29:00Z');
    expect(result.trades[0].executions[1].datetime).toBe('2026-03-09T15:31:05Z');
  });

  test('parses Tradovate rows that are incorrectly quoted as entire CSV records', async () => {
    const csv = [
      'orderId,Account,Order ID,B/S,Contract,Product,Product Description,avgPrice,filledQty,Fill Time,lastCommandId,Status,_priceFormat,_priceFormatType,_tickSize,spreadDefinitionId,Version ID,Timestamp,Date,Quantity,Text,Type,Limit Price,Stop Price,decimalLimit,decimalStop,Filled Qty,Avg Fill Price,decimalFillAvg,Venue,Notional Value,Currency',
      '"360321559845,LFE1006267905001,360321559845, Sell,MNQM6,MNQ,Micro E-mini NASDAQ-100,25081.0,2,04/09/2026 17:24:03,360321559845, Filled,-2,0,0.25,,360321559845,04/09/2026 17:24:03,4/9/26,2,Chart, Market,,,,,2,25081.00,25081.0,,""100,324.00"",USD"',
      '360321559851,LFE1006267905001,360321559851, Buy,MNQM6,MNQ,Micro E-mini NASDAQ-100,,,,360321559869, Canceled,-2,0,0.25,,360321559869,04/09/2026 17:27:30,4/9/26,2,Chart, Limit,25013.25,,25013.25,,,,,,,USD',
      '360321559858,LFE1006267905001,360321559858, Buy,MNQM6,MNQ,Micro E-mini NASDAQ-100,,,,360321559865, Canceled,-2,0,0.25,,360321559865,04/09/2026 17:27:08,4/9/26,2,Chart, Stop,,25080.25,,25080.25,,,,,,USD',
      '"360321559879,LFE1006267905001,360321559879, Buy,MNQM6,MNQ,Micro E-mini NASDAQ-100,25055.25,2,04/09/2026 17:28:14,360321559879, Filled,-2,0,0.25,,360321559879,04/09/2026 17:28:14,4/9/26,2,Exit, Market,,,,,2,25055.25,25055.25,,""100,221.00"",USD"'
    ].join('\n');

    const result = await parseCSV(Buffer.from(csv), 'tradovate', {});

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].side).toBe('short');
    expect(result.trades[0].quantity).toBe(2);
    expect(result.trades[0].entryPrice).toBe(25081);
    expect(result.trades[0].exitPrice).toBe(25055.25);
  });
});
