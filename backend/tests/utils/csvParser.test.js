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

  test('parses issue 304 Tradovate bracket fills as a flat short with zero execution costs', async () => {
    const csv = [
      'orderId,Account,Order ID,B/S,Contract,Product,Product Description,avgPrice,filledQty,Fill Time,lastCommandId,Status,_priceFormat,_priceFormatType,_tickSize,spreadDefinitionId,Version ID,Timestamp,Date,Quantity,Text,Type,Limit Price,Stop Price,decimalLimit,decimalStop,Filled Qty,Avg Fill Price,decimalFillAvg,Venue,Notional Value,Currency',
      '425825160659,,425825160659,Sell,MESM6,MES,Micro E-mini S&P 500,7157.5,4,04/23/2026 16:00:28,425825160659,Filled,-2,0,0.25,,425825160659,04/23/2026 16:00:28,4/23/26,4,multibracket,Market,,,,,4,7157.5,7157.5,,143150,USD',
      '425825160669,,425825160669,Buy,MESM6,MES,Micro E-mini S&P 500,7157.5,2,04/23/2026 16:03:38,425825160735,Filled,-2,0,0.25,,425825160735,04/23/2026 16:01:22,4/23/26,2,multibracket,Stop,,7157.25,,7157.25,2,7157.5,7157.5,,71575,USD',
      '425825160673,,425825160673,Buy,MESM6,MES,Micro E-mini S&P 500,7157.5,1,04/23/2026 16:03:38,425825160731,Filled,-2,0,0.25,,425825160731,04/23/2026 16:01:18,4/23/26,1,multibracket,Stop,,7157.25,,7157.25,1,7157.5,7157.5,,35787.5,USD',
      '425825160677,,425825160677,Buy,MESM6,MES,Micro E-mini S&P 500,7157.5,1,04/23/2026 16:03:38,425825160727,Filled,-2,0,0.25,,425825160727,04/23/2026 16:01:14,4/23/26,1,multibracket,Stop,,7157.25,,7157.25,1,7157.5,7157.5,,35787.5,USD'
    ].join('\n');

    const result = await parseCSV(Buffer.from(csv), 'tradovate', {});

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].side).toBe('short');
    expect(result.trades[0].quantity).toBe(4);
    expect(result.trades[0].entryPrice).toBe(7157.5);
    expect(result.trades[0].exitPrice).toBe(7157.5);
    expect(result.trades[0].pnl).toBe(0);
    expect(result.trades[0].commission).toBe(0);
    expect(result.trades[0].fees).toBe(0);
    expect(result.trades[0].executions).toHaveLength(4);
    expect(result.trades[0].executions.every(exec => exec.commission === 0 && exec.fees === 0)).toBe(true);
    expect(result.trades[0].executions.map(exec => exec.orderId)).toEqual([
      '425825160659',
      '425825160669',
      '425825160673',
      '425825160677'
    ]);
  });

  test('parses custom generic mappings with separate commission and fees columns', async () => {
    const csv = [
      'Symbol,Trade Date,Qty,Entry Price,Exit Price,Commission,Fees',
      'AAPL,04/24/2026,10,100,105,1.25,0.42'
    ].join('\n');

    const result = await parseCSV(Buffer.from(csv), 'generic', {
      customMapping: {
        mapping_name: 'Separate Costs',
        symbol_column: 'Symbol',
        quantity_column: 'Qty',
        entry_price_column: 'Entry Price',
        exit_price_column: 'Exit Price',
        entry_date_column: 'Trade Date',
        commission_column: 'Commission',
        fees_column: 'Fees'
      }
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].commission).toBe(1.25);
    expect(result.trades[0].fees).toBe(0.42);
  });

  test('parses IBKR sell-only stock execution as close-only instead of an open short', async () => {
    const csv = [
      'Symbol,Quantity,Buy/Sell,Price,Date/Time,Commission,LevelOfDetail,TradeID,Conid,AssetClass',
      'IBKR,0.0228,SELL,81.67,2026-04-20 10:25:08,-0.018663565,EXECUTION,9349469033,43645865,STK'
    ].join('\n');

    const result = await parseCSV(Buffer.from(csv), 'ibkr_trade_confirmation', {
      tradeGroupingSettings: { enabled: false }
    });

    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade.side).toBe('long');
    expect(trade.quantity).toBeCloseTo(0.0228, 8);
    expect(trade.entryPrice).toBe(81.67);
    expect(trade.exitPrice).toBe(81.67);
    expect(trade.exitTime).toBe(trade.entryTime);
    expect(trade.isCloseOnly).toBe(true);
    expect(trade.pnl).toBeCloseTo(-0.018663565, 8);
    expect(trade.executions).toHaveLength(2);
    expect(trade.executions.find(exec => exec.synthetic)).toMatchObject({
      action: 'buy',
      synthetic: true,
      synthetic_reason: 'missing_opening_execution'
    });
    expect(trade.executions.find(exec => !exec.synthetic)).toMatchObject({
      action: 'sell',
      orderId: '9349469033'
    });
  });

  test('keeps explicit IBKR sell-to-open stock execution as an open short', async () => {
    const csv = [
      'Symbol,Quantity,Buy/Sell,Price,Date/Time,Commission,LevelOfDetail,TradeID,Conid,AssetClass,Notes/Codes',
      'TSLA,5,SELL,210.50,2026-04-20 10:25:08,-1.25,EXECUTION,short-open-1,12345,STK,O'
    ].join('\n');

    const result = await parseCSV(Buffer.from(csv), 'ibkr_trade_confirmation', {
      tradeGroupingSettings: { enabled: false }
    });

    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade.side).toBe('short');
    expect(trade.quantity).toBe(5);
    expect(trade.entryPrice).toBe(210.5);
    expect(trade.exitPrice).toBeNull();
    expect(trade.pnl).toBeNull();
    expect(trade.isCloseOnly).toBeUndefined();
    expect(trade.executions).toHaveLength(1);
    expect(trade.executions[0].synthetic).toBeUndefined();
  });

  test('keeps legacy custom fees mappings as combined commission and fees', async () => {
    const csv = [
      'Symbol,Trade Date,Qty,Entry Price,Exit Price,Fees and Commission',
      'AAPL,04/24/2026,10,100,105,1.67'
    ].join('\n');

    const result = await parseCSV(Buffer.from(csv), 'generic', {
      customMapping: {
        mapping_name: 'Legacy Costs',
        symbol_column: 'Symbol',
        quantity_column: 'Qty',
        entry_price_column: 'Entry Price',
        exit_price_column: 'Exit Price',
        entry_date_column: 'Trade Date',
        fees_column: 'Fees and Commission'
      }
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].commission).toBe(1.67);
    expect(result.trades[0].fees).toBe(1.67);
  });

  test('matches custom generic transaction rows into a round trip trade', async () => {
    const csv = [
      'Shymbola,Date,Price,Quantity,Side,Commission,Fees',
      'RANDO,2026-04-14 06:25:10,0.7489,1000,B,7.0000,-1.0000',
      'RANDO,2026-04-14 06:30:07,0.9958,1000,S,5.0000,3.0000'
    ].join('\n');

    const result = await parseCSV(Buffer.from(csv), 'generic', {
      customMapping: {
        mapping_name: 'Issue 309 Transaction Rows',
        symbol_column: 'Shymbola',
        quantity_column: 'Quantity',
        entry_price_column: 'Price',
        entry_date_column: 'Date',
        side_column: 'Side',
        commission_column: 'Commission',
        fees_column: 'Fees'
      },
      tradeGroupingSettings: { enabled: false }
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].symbol).toBe('RANDO');
    expect(result.trades[0].side).toBe('long');
    expect(result.trades[0].quantity).toBe(1000);
    expect(result.trades[0].entryPrice).toBe(0.7489);
    expect(result.trades[0].exitPrice).toBe(0.9958);
    expect(result.trades[0].commission).toBe(12);
    expect(result.trades[0].fees).toBe(2);
    expect(result.trades[0].pnl).toBeCloseTo(232.9, 5);
    expect(result.trades[0].executions).toHaveLength(2);
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

  test('converts Tradovate paired trade export timestamps using the user timezone', async () => {
    const csv = [
      'Position ID,Timestamp,Trade Date,Net Pos,Net Price,Bought,Avg. Buy,Sold,Avg. Sell,Account,Contract,Product,Product Description,_priceFormat,_priceFormatType,_tickSize,Pair ID,Buy Fill ID,Sell Fill ID,Paired Qty,Buy Price,Sell Price,P/L,Currency,Bought Timestamp,Sold Timestamp',
      '465747740010,04/09/2026 17:14:44,2026-04-09,0,,24,25065.97,24,25061.03,APEX4977960000002,MNQM6,MNQ,Micro E-mini NASDAQ-100,-2,0,0.25,465747740193,465747740168,465747740191,1,25060.75,25048.50,-24.50,USD,04/09/2026 15:38:40,04/09/2026 15:40:03'
    ].join('\n');

    const result = await parseCSV(Buffer.from(csv), 'tradovate', {
      userTimezone: 'Europe/Berlin'
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].side).toBe('long');
    expect(result.trades[0].entryTime).toBe('2026-04-09T13:38:40Z');
    expect(result.trades[0].exitTime).toBe('2026-04-09T13:40:03Z');
    expect(result.trades[0].executions[0].datetime).toBe('2026-04-09T13:38:40Z');
    expect(result.trades[0].executions[1].datetime).toBe('2026-04-09T13:40:03Z');
  });
});
