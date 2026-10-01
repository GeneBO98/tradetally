jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn().mockReturnValue(null), set: jest.fn(), del: jest.fn(), data: {} }));
jest.mock('../../src/utils/cusipQueue', () => ({ addToQueue: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({ convertTradeToUSD: jest.fn(trade => trade), userHasProAccess: jest.fn().mockResolvedValue(false) }));

const { parseCSV, parseDate, parseDateTime } = require('../../src/utils/csvParser');
const context = { tradeGroupingSettings: { enabled: false } };

describe('September 23–October 1 import diagnostics regressions', () => {
  const statusHistory = [
    'Symbol,Side,Type,Quantity,Limit price,Stop price,Fill quantity,Avg fill price,Status,Status time,Order ID,Duration',
    'F.US.MNQZ26,Sell,Market,3,,,1,30907,Filled,2026-09-25 11:04:17,close,GTC',
    'F.US.MNQZ26,Sell,Stop,1,,30766,0,,Cancelled,2026-09-25 11:04:17,cancel,GTC',
    'F.US.MNQZ26,Buy,Market,3,,,1,30900,Filled,2026-09-25 11:00:06,open,GTC'
  ].join('\n');

  test.each(['auto', 'generic', 'tradingview'])('imports status-time futures orders with %s selection', async broker => {
    const result = await parseCSV(Buffer.from(statusHistory), broker, context);
    expect(result.diagnostics.detectedBroker).toBe('tradingview');
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ symbol: 'MNQZ26', instrumentType: 'future', underlyingAsset: 'MNQ', contractMonth: '12', contractYear: 2026, pointValue: 2, quantity: 1, entryPrice: 30900, exitPrice: 30907, pnl: 14 });
    expect(result.diagnostics.invalidRows).toBe(0);
    expect(result.diagnostics.expected_skipped_rows).toBe(1);
  });

  test('does not use requested quantity when reported fill quantity is zero', async () => {
    const result = await parseCSV(Buffer.from(statusHistory.replace('3,,,1,30907', '3,,,0,30907')), 'auto', context);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].exitPrice).toBeNull();
    expect(result.diagnostics.invalidRows).toBe(1);
  });

  test('imports glued ISO timestamps and keeps cancelled orders out', async () => {
    const csv = [
      'Symbol,Side,Type,Quantity,Fill price,Status,Placing time,Closing time,Order ID',
      'BLACKBULL:GBPJPY,Buy,Market,100,210.041,Filled,2026-09-2204:15:01,2026-09-2204:15:01,open',
      'BLACKBULL:GBPJPY,Sell,Stop,100,209.821,Filled,2026-09-2204:15:01,2026-09-2210:55:44,close',
      'BLACKBULL:GBPJPY,Sell,Limit,100,,Cancelled,2026-09-2204:15:01,2026-09-2210:55:44,cancel'
    ].join('\n');
    const result = await parseCSV(Buffer.from(csv), 'tradingview', context);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ entryTime: '2026-09-22T04:15:01', exitTime: '2026-09-22T10:55:44', quantity: 100 });
    expect(result.diagnostics.invalidRows).toBe(0);
    expect(parseDate('2026-09-2204:15:01')).toBe('2026-09-22');
    expect(parseDateTime('2026-09-2204:15:01')).toBe('2026-09-22T04:15:01');
  });

  const editedTransactions = [
    'Date,Ticker Action,Companu,Description,Quantity,Price,Comm,Total Amt',
    '09-11-26,Sell to Close,HD 09/11/2026 285.00 P,PUT EXAMPLE,2,$0.02,$1.33,$2.67',
    '09-11-26,Buy to Close,HD 09/11/2026 307.50 P,PUT EXAMPLE,2,$0.22,$1.32,-$45.32',
    '09-10-26,Qualified Dividend,MSFT,EXAMPLE,,,,$273.00',
    '09-03-26,Buy to Open,HD 09/11/2026 285.00 P,PUT EXAMPLE,2,$0.06,$1.32,-$13.32',
    '09-03-26,Sell to Open,HD 09/11/2026 307.50 P,PUT EXAMPLE,2,$1.11,$1.33,$220.67'
  ].join('\n');

  test('imports the edited option transaction layout with correct dates and net contract P&L', async () => {
    const result = await parseCSV(Buffer.from(editedTransactions), 'generic', context);
    expect(result.trades).toHaveLength(2);
    expect(result.trades[0]).toMatchObject({ instrumentType: 'option', optionType: 'put', strikePrice: 285, expirationDate: '2026-09-11', tradeDate: '2026-09-03', side: 'long', quantity: 2 });
    expect(result.trades[1]).toMatchObject({ instrumentType: 'option', strikePrice: 307.5, tradeDate: '2026-09-03', side: 'short', quantity: 2 });
    expect(result.trades[0].commission).toBeCloseTo(2.65, 8);
    expect(result.trades[0].pnl).toBeCloseTo(-10.65, 8);
    expect(result.trades[1].commission).toBeCloseTo(2.65, 8);
    expect(result.trades[1].pnl).toBeCloseTo(175.35, 8);
    expect(result.diagnostics.expected_skipped_rows).toBe(1);
    expect(result.diagnostics.invalidRows).toBe(0);
  });

  test('preserves contract P&L when generic option round trips are grouped', async () => {
    const csv = [
      'Symbol,Side,Quantity,Price,Date,Commission',
      'AAPL261016C00200000,Buy,1,5,2026-10-01 10:00:00,1',
      'AAPL261016C00200000,Sell,1,7,2026-10-01 10:05:00,1',
      'AAPL261016C00200000,Buy,1,6,2026-10-01 10:10:00,1',
      'AAPL261016C00200000,Sell,1,8,2026-10-01 10:15:00,1'
    ].join('\n');
    const result = await parseCSV(Buffer.from(csv), 'generic');
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ instrumentType: 'option', contractSize: 100, quantity: 2, pnl: 396 });
  });

  test.each(['BLACKBULL:NAS100', 'CAPITALCOM:NAS100', 'BLACKBULL:SPX500'])('does not value %s as an exchange future', async symbol => {
    const csv = `Symbol,Side,Quantity,Fill price,Status,Closing time,Order ID\n${symbol},Sell,20,100,Filled,2026-10-01 10:00:00,open\n${symbol},Buy,20,110,Filled,2026-10-01 11:00:00,close`;
    const result = await parseCSV(Buffer.from(csv), 'tradingview', context);
    expect(result.trades[0].instrumentType).toBe('stock');
    expect(result.trades[0].pnl).toBe(-200);
    const { computeTradePnl } = require('../../src/services/pnlEngine');
    expect(computeTradePnl({ side: result.trades[0].side, instrumentType: result.trades[0].instrumentType, executions: result.trades[0].executions }).aggregate.pnl).toBe(-200);
  });

  test('explains already-imported TradingView executions', async () => {
    const first = await parseCSV(Buffer.from(statusHistory), 'tradingview', context);
    const result = await parseCSV(Buffer.from(statusHistory), 'tradingview', {
      ...context, existingExecutions: { 'F.US.MNQZ26': first.trades[0].executions }
    });
    expect(result.trades).toEqual([]);
    expect(result.diagnostics.duplicateExecutions).toBe(2);
    expect(result.diagnostics.invalidRows).toBe(0);
    expect(result.diagnostics.user_summary.title).toContain('already imported');
  });

  const deltaHistory = [
    'Time,Contract,Qty,Side,Filled/Remaining,Exec.Price,Order Price,Stop Price,Order Value,Trading Fees,Cashflow,Realised P&L,Order Type,Status,Explanation,Client Order ID,Order ID',
    '2026-09-29 22:44:32.876436+05:30 IST Asia/Kolkata,MUBARAKUSD,52,buy,0/52,,0.06082,,,0,,,limit_order,cancelled,cancelled_by_user,,cancel',
    '2026-09-29 21:56:38.669134+05:30 IST Asia/Kolkata,BTCUSD,1,sell,1/0,83199.5,79039,83204,83.1995,0.04417894,0.2105,0.2105,market_order,closed,,,close',
    '2026-09-29 21:25:49.252513+05:30 IST Asia/Kolkata,BTCUSD,1,buy,1/0,82989,87140.5,,82.989,0.01587244,0,0,market_order,closed,,,open'
  ].join('\n');

  test.each([{}, { customMapping: { symbol_column: 'Contract', quantity_column: 'Qty', side_column: 'Side', entry_date_column: 'Time', entry_price_column: 'Exec.Price', fees_column: 'Trading Fees', pnl_column: 'Realised P&L', has_header_row: false } }])('imports Delta orders in base units, with precise UTC times and net costs: %j', async options => {
    const result = await parseCSV(Buffer.from(deltaHistory), 'generic', { ...context, ...options });
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ symbol: 'BTCUSD', instrumentType: 'crypto', quantity: 0.001, entryPrice: 82989, exitPrice: 83199.5, entryTime: '2026-09-29T15:55:49Z', exitTime: '2026-09-29T16:26:38Z' });
    expect(result.trades[0].pnl).toBeCloseTo(0.15044862, 8);
    expect(result.trades[0].commission + result.trades[0].fees).toBeCloseTo(0.06005138, 8);
    const { computeTradePnl } = require('../../src/services/pnlEngine');
    expect(computeTradePnl({ side: 'long', instrumentType: 'crypto', executions: result.trades[0].executions }).aggregate.pnl).toBeCloseTo(0.15044862, 8);
    expect(result.diagnostics.expected_skipped_rows).toBe(1);
    expect(result.diagnostics.invalidRows).toBe(0);
  });

  test.each([
    ['unknown product', csv => csv.replaceAll('BTCUSD', 'UNKNOWNUSD')],
    ['inconsistent contract value', csv => csv.replace('83.1995', '83199.5')],
    ['partial order', csv => csv.replaceAll('1/0', '0.5/0.5')]
  ])('rejects Delta %s with a reason', async (label, transform) => {
    const result = await parseCSV(Buffer.from(transform(deltaHistory)), 'generic', context);
    expect(result.diagnostics.invalidRows).toBeGreaterThan(0);
    expect(result.diagnostics.skippedReasons.some(item => /Delta/.test(item.reason))).toBe(true);
  });

  test('uses ETH contract units and keeps explicit offsets authoritative', async () => {
    const csv = [
      deltaHistory.split('\n')[0],
      '2026-10-01 10:00:00+05:30 IST Asia/Kolkata,ETHUSD,2,buy,2/0,3000,,,60,0.01,0,0,market_order,closed,,,eth-open',
      '2026-10-01 11:00:00+05:30 IST Asia/Kolkata,ETHUSD,2,sell,2/0,3010,,,60.2,0.02,0.2,0.2,market_order,closed,,,eth-close'
    ].join('\n');
    const result = await parseCSV(Buffer.from(csv), 'auto', { ...context, userTimezone: 'America/New_York' });
    expect(result.trades[0]).toMatchObject({ symbol: 'ETHUSD', instrumentType: 'crypto', quantity: 0.02, entryTime: '2026-10-01T04:30:00Z', exitTime: '2026-10-01T05:30:00Z' });
    expect(result.trades[0].pnl).toBeCloseTo(0.17, 8);
  });

  test('keeps saved column mappings authoritative for the edited transaction layout', async () => {
    const result = await parseCSV(Buffer.from(editedTransactions), 'generic', {
      ...context,
      customMapping: { symbol_column: 'Description', side_column: 'Ticker Action', quantity_column: 'Quantity', entry_date_column: 'Date', entry_price_column: 'Price' }
    });
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.trades.every(trade => trade.symbol === 'PUT EXAMPLE')).toBe(true);
  });

  test.each([
    'Time,Text\n2026-09-25 10:46:28,Order 123 has been executed at price 4275.20 for 1 units',
    'Time,Balance before,Balance after,Realized PnL (value),Realized PnL (currency),Action\n2026-09-25 10:46:28,5000,5010,10,USD,Close long position for symbol EXAMPLE at price 110 for 1 units',
    'Symbol,Qty,Long Qty,Short Qty,Avg Fill Price,Update Time,Profit,Position ID\nUSDJPY,100,100,0,157.213,2026-09-25 10:08:10,1.78,example'
  ])('keeps incomplete reports classified with export guidance', async csv => {
    const result = await parseCSV(Buffer.from(csv), 'tradingview', context);
    expect(result.trades).toEqual([]);
    expect(result.diagnostics.nonTradeFile).toBeDefined();
    expect(result.diagnostics.user_summary.steps[0]).toContain('export');
  });
});
