jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn().mockReturnValue(null), set: jest.fn(), del: jest.fn(), data: {} }));
jest.mock('../../src/utils/cusipQueue', () => ({ addToQueue: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({ convertTradeToUSD: jest.fn(trade => trade), userHasProAccess: jest.fn().mockResolvedValue(false) }));

const { parseCSV, parseNumeric, parseDateTime, normalizeCsvBuffer } = require('../../src/utils/csvParser');

// Regressions built from anonymized unknown_csv_headers samples (June–September 2026).
const noGrouping = { tradeGroupingSettings: { enabled: false } };
const parse = (csv, broker = 'auto', context = {}) => parseCSV(Buffer.from(csv), broker, { ...noGrouping, ...context });

describe('parseNumeric locale and currency handling', () => {
  test.each([
    ['1.496,29 USD', 1496.29],
    ['205,51 EUR', 205.51],
    ['0,1028', 0.1028],
    ['€12,50', 12.5],
    ['USD$3.20', 3.2],
    ['@11.5600000000', 11.56],
    ['-$ 0,50', -0.5],
    ['1 234,56', 1234.56],
    ['1,234', 1234],
    ['1,234,567', 1234567],
    ['($1,234.00)', -1234],
    ['0.1 Lots', 0.1],
    ['1.5e-5', 0.000015]
  ])('%s -> %s', (input, expected) => {
    expect(parseNumeric(input)).toBeCloseTo(expected, 8);
  });

  test('does not glue date parts into a number', () => {
    expect(parseNumeric('10 Jun 2026')).toBe(10);
  });
});

describe('generic column mapping', () => {
  test('applies the offset from a (UTC-6) header suffix', async () => {
    const result = await parse([
      'Symbol,Opening Direction,Closing Time (UTC-6),Entry price,Closing price,Closing Quantity,Net USD,Balance USD',
      'NAS100,Sell,10 Jun 2026 09:10:41.134,29096.7,28775.5,0.1 Lots,32.12,112.12'
    ].join('\n'));

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      symbol: 'NAS100',
      side: 'short',
      quantity: 0.1,
      entryPrice: 29096.7,
      exitPrice: 28775.5,
      pnl: 32.12
    });
    expect(result.trades[0].entryTime).toBe('2026-06-10T09:10:41-06:00');
  });

  test('accepts ISO dates whose time was glued on by a spreadsheet', () => {
    expect(parseDateTime('2026-09-1603:49:58')).toBe('2026-09-16T03:49:58');
  });

  test('re-imports TradeTally exports, rebuilding option symbols', async () => {
    const result = await parse([
      'Symbol,Side,Quantity,Entry Price,Exit Price,Entry Date,Exit Date,P&L,Fees,Commission,Notes,Strategy,Setup,Tags,Broker,Status,Instrument Type,Option Type,Strike Price,Expiration Date,Quality Grade',
      'SOXL,short,1.0000,1.640000,0.920000,2026-06-20T14:31:00.000Z,2026-06-25T15:00:00.000Z,72.000000,0,0,,Cash Secured Put,,,,Closed,option,put,170.0000,2026-07-02,D',
      'AAPL,long,10,100,110,2026-06-20T14:31:00.000Z,2026-06-20T15:31:00.000Z,100,0,0,,,,,,Closed,stock,,,,'
    ].join('\n'));

    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({
      symbol: 'SOXL260702P00170000',
      instrumentType: 'option',
      side: 'short',
      entryTime: '2026-06-20T14:31:00Z',
      exitTime: '2026-06-25T15:00:00Z'
    });
    expect(result.trades[1]).toMatchObject({ symbol: 'AAPL', side: 'long', pnl: 100 });
  });

  test('stores negative "-0.75 USD" execution fees as a positive cost', async () => {
    const result = await parse([
      'Symbol,Side,Quantity,Price,Date,Execution fee',
      'AAPL,Buy,5,100,2026-09-01 10:00:00,-0.75 USD'
    ].join('\n'), 'generic');

    expect(result.trades[0].fees).toBeCloseTo(0.75, 8);
  });
});

describe('broker-specific formats seen as generic/auto failures', () => {
  test('Fidelity history without an Account Number column', async () => {
    const result = await parse([
      'Run Date,Action,Symbol,Description,Type,Exchange Quantity,Exchange Currency,Currency,Price,Quantity,Exchange Rate,Commission,Fees,Accrued Interest,Amount,Cash Balance,Settlement Date',
      '08/31/2026,DIVIDEND RECEIVED FIDELITY GOVERNMENT MONEY MARKET (SPAXX) (Cash),SPAXX,FIDELITY GOVERNMENT MONEY MARKET,Cash,0,"",USD,"",0,0,"","","",0.52,81.46,""',
      '08/25/2026,YOU SOLD PROSHARES ULTRAPRO QQQ (TQQQ) (Cash),TQQQ,PROSHARES ULTRAPRO QQQ,Cash,0,"",USD,71.50,-1,0,"","","",71.50,150.44,08/26/2026',
      '08/24/2026,YOU BOUGHT PROSHARES ULTRAPRO QQQ (TQQQ) (Cash),TQQQ,PROSHARES ULTRAPRO QQQ,Cash,0,"",USD,69.91,1,0,"","","","-69.91",80.94,08/25/2026'
    ].join('\n'));

    expect(result.diagnostics.detectedBroker).toBe('fidelity');
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ symbol: 'TQQQ', side: 'long' });
  });

  test('Wealthsimple activities with per-contract option prices', async () => {
    const result = await parse([
      'effective_date,effective_time,settlement_date,account_id,account_type,activity_type,activity_sub_type,description,direction,symbol,underlying symbol,name,currency,quantity,unit_price,commission,net_cash_amount',
      '2026-06-18,8:28:53,2026-06-22,ACCT,Margin,Trade,SELL,"TSLA  260731P00390000: Sold 1 contract",SHORT,TSLA  260731P00390000,TSLA,Tesla Inc,USD,-1,2360,0,2360',
      '2026-06-26,9:09:16,2026-06-29,ACCT,Margin,Trade,BUY,"TSLA  260731P00390000: Bought 1 contract",SHORT,TSLA  260731P00390000,TSLA,Tesla Inc,USD,1,2391,0,-2391',
      '2026-07-02,7:52:06,,ACCT,Margin,MoneyMovement,TRANSFER,Money transfer out of the account,,,,,CAD,-967.42,,,-967.42'
    ].join('\n'));

    expect(result.diagnostics.detectedBroker).toBe('wealthsimple');
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ symbol: 'TSLA260731P00390000', side: 'short' });
    expect(result.trades[0].executions.map(execution => execution.price)).toEqual([23.6, 23.91]);
  });

  test('paperMoney manual trades with date-only Exec Time', async () => {
    const result = await parse([
      ',,Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Price Improvement,Order Type',
      ',,9/15/26,STOCK,BUY,+1,TO OPEN,AAPL,,,STOCK,330,330,-,MANUAL',
      ',,9/15/26,STOCK,SELL,-1,TO CLOSE,AAPL,,,STOCK,340,340,-,MANUAL'
    ].join('\n'));

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ symbol: 'AAPL', side: 'long', tradeDate: '2026-09-15' });
  });

  test('Spanish TradingView order export', async () => {
    const result = await parse([
      'Símbolo,Lado,Tipo,Cantidad,Cant. pendiente,Cantidad ejecutada,Precio límite,Precio stop,Take Profit,Stop Loss,Precio medio de ejecución,Estado,Fecha Ult. Actualización,ID de Orden,Vencimiento,Fecha de vencimiento',
      'MESU6,Comprar,Mercado,1,0,1,,,,,7601.25,Ejecutadas,2026-09-16 06:35:26,1002,Day,',
      'MESU6,Comprar,Stop Loss,1,,,,7612.5,,,,Canceladas,2026-09-16 06:35:26,1003,Day,',
      'MESU6,Vender,Mercado,1,0,1,,,,,7601.5,Ejecutadas,2026-09-16 06:33:19,1001,Day,'
    ].join('\n'), 'tradingview');

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ symbol: 'MESU6', side: 'short' });
  });
});

describe('wrong broker selected', () => {
  const ninjaTraderGrid = [
    'Trade number,Instrument,Account,Strategy,Market pos.,Qty,Entry price,Exit price,Entry time,Exit time,Entry name,Exit name,Profit,Cum. net profit,Commission,Clearing Fee,Exchange Fee,IP Fee,NFA Fee,MAE,MFE,ETD,Bars,',
    '1,MES 09-26,SIM-1,,Short,1,7427.50,7423.50,7/28/2026 9:45:17 AM,7/28/2026 9:46:05 AM,Entry,Target2,$20.00,$20.00,$0.00,$0.00,$0.00,$0.00,$0.00,$8.75,$21.25,$1.25,0,'
  ].join('\n');

  test('falls back to the detected parser and reports the switch', async () => {
    const result = await parse(ninjaTraderGrid, 'tradovate');

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ side: 'short', entryPrice: 7427.5, exitPrice: 7423.5 });
    expect(result.diagnostics.brokerFallback).toEqual({ selectedBroker: 'tradovate', usedBroker: 'ninjatrader' });
    expect(result.diagnostics.warnings.join(' ')).toContain('imported as ninjatrader');
  });

  test('keeps European NinjaTrader money values intact', async () => {
    const result = await parse([
      'Trade number;Instrument;Account;Strategy;Market pos.;Qty;Entry price;Exit price;Entry time;Exit time;Entry name;Exit name;Profit;Cum. net profit;Commission;Clearing Fee;Exchange Fee;IP Fee;NFA Fee;MAE;MFE;ETD;Bars;',
      '1;MNQ SEP26;SIM-1;;Long;1;29775,75;29753,50;14/07/2026 8:51:09 am;14/07/2026 8:52:39 am;;;-$ 45,50;-$ 46,00;$ 1,00;$ 0,00;$ 0,00;$ 0,00;$ 0,00;$ 44,50;$ 44,50;$ 90,00;0;'
    ].join('\n'), 'tradingview');

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ entryPrice: 29775.75, exitPrice: 29753.5, commission: 1 });
  });
});

describe('file encodings', () => {
  const csv = 'Symbol,Side,Quantity,Price,Date\nAAPL,Buy,10,100,2026-09-01 10:00:00\nAAPL,Sell,10,110,2026-09-01 11:00:00\n';

  test.each([
    ['UTF-16LE with BOM', Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csv, 'utf16le')])],
    ['UTF-16LE without BOM', Buffer.from(csv, 'utf16le')]
  ])('%s', async (_label, buffer) => {
    expect(normalizeCsvBuffer(buffer).includes(0)).toBe(false);
    const result = await parseCSV(buffer, 'auto', {});
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ symbol: 'AAPL', pnl: 100 });
  });
});

describe('non-trade files', () => {
  test('explains a positions report instead of listing row errors', async () => {
    const result = await parse([
      'Symbol,Side,Quantity,Avg fill price,Take profit,Stop loss,Last price,Unrealized PnL (value),Unrealized PnL (currency),Unrealized PnL %,Trade value,Market value',
      'AAPL,Long,10,100,,,105,50,USD,5,1000,1050'
    ].join('\n'), 'tradingview');

    expect(result.trades).toHaveLength(0);
    expect(result.diagnostics.nonTradeFile).toBe('positions');
    expect(result.diagnostics.user_summary.title).toBe('This looks like an open positions report, not trade history.');
  });

  test('explains a balance history when the selected parser throws', async () => {
    await expect(parse([
      'Time,Realized PnL (value),Realized PnL (currency)',
      '2026-09-06 10:00:00,12.5,USD'
    ].join('\n'), 'papermoney')).rejects.toThrow('a daily or account P&L summary, not trade history');
  });
});
