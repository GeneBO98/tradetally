jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn().mockReturnValue(null), set: jest.fn(), del: jest.fn(), data: {} }));
jest.mock('../../src/utils/cusipQueue', () => ({ addToQueue: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({ convertTradeToUSD: jest.fn(trade => trade), userHasProAccess: jest.fn().mockResolvedValue(false) }));

const { parseCSV, parseDate, parseDateTime } = require('../../src/utils/csvParser');
const contracts = require('../../../tests/fixtures/trading-calculation-contracts.json');

const aliases = { entry_price: 'entryPrice', exit_price: 'exitPrice', entry_time: 'entryTime', exit_time: 'exitTime', trade_date: 'tradeDate' };

describe('August–September 2026 import failure regressions', () => {
  test.each(contracts.recent_csv_failure_cases)('$id', async ({ csv, broker, expected, context = {} }) => {
    const result = await parseCSV(Buffer.from(csv), broker, { tradeGroupingSettings: { enabled: false }, ...context });
    expect(result.trades).toHaveLength(expected.length);
    expected.forEach((fields, index) => {
      for (const [field, value] of Object.entries(fields)) {
        const actual = result.trades[index][field] ?? result.trades[index][aliases[field]];
        if (typeof value === 'number') expect(actual).toBeCloseTo(value, 8);
        else expect(actual).toEqual(value);
      }
    });
  });

  test('IBKR compact dates retain the execution timezone and calendar date', () => {
    expect(parseDate('20260902;095022 EDT')).toBe('2026-09-02');
    expect(parseDateTime('20260902;095022 EDT')).toBe('2026-09-02T09:50:22-04:00');
  });

  test('Webull missing data produces serializable row reasons', async () => {
    const result = await parseCSV(Buffer.from('Name,Symbol,Side,Status,Filled,Avg Price,Filled Time\nExample,AAPL,Buy,Filled,1,invalid,08/14/2026 10:00:00 EDT'), 'webull');
    expect(result.diagnostics.reason_breakdown).toContainEqual({ reason: 'Missing essential data', count: 1 });
  });
});

describe('TradingView history safeguards', () => {
  const history = contracts.recent_csv_failure_cases.find(row => row.id === 'tradingview_history_repeated_costs').csv;
  test('does not invent an entry for an incomplete or split trade', async () => {
    const result = await parseCSV(Buffer.from(history.split('\n').slice(0, 2).join('\n')), 'auto');
    expect(result.trades).toEqual([]);
    expect(result.diagnostics.invalidRows).toBe(1);
    expect(result.diagnostics.reason_breakdown[0].reason).toContain('one entry and one exit');
  });
  test('keeps breakeven PnL as zero', async () => {
    const result = await parseCSV(Buffer.from(history.replaceAll(',18,9,2', ',0,0,2')), 'auto');
    expect(result.trades[0].pnl).toBe(0);
  });
  test('rejects mismatched quantities instead of fabricating the remainder', async () => {
    const result = await parseCSV(Buffer.from(history.replace('110,2,200', '110,1,200')), 'auto');
    expect(result.trades).toEqual([]);
    expect(result.diagnostics.invalidRows).toBe(2);
  });
});


test('saved mappings remain authoritative for newly recognized TradingView history', async () => {
  const csv = contracts.recent_csv_failure_cases.find(row => row.id === 'tradingview_history_repeated_costs').csv;
  const result = await parseCSV(Buffer.from(csv), 'generic', {
    customMapping: {
      symbol_column: 'Symbol', entry_date_column: 'Date and time',
      entry_price_column: 'Price', quantity_column: 'Size (qty)',
      pnl_column: 'Net PnL USD'
    },
    tradeGroupingSettings: { enabled: false }
  });
  expect(result.diagnostics.detectedBroker).toBe('generic');
  expect(result.trades).toHaveLength(2);
});

test('working orders remain excluded from trades', async () => {
  const result = await parseCSV(Buffer.from('Symbol,Side,Type,Quantity,Fill price,Status,Placing time,Order ID\nBINANCE:BTCUSDT,Buy,Stop Loss,0.067,,Working,2026-09-06 13:42:13,working-1'), 'tradingview');
  expect(result.trades).toEqual([]);
  expect(result.diagnostics.reason_breakdown[0].reason).toContain('not filled');
});


test('TradingView history pairs source accounts independently and honors destination selection', async () => {
  const [header, ...rows] = contracts.recent_csv_failure_cases.find(row => row.id === 'tradingview_history_repeated_costs').csv.split('\n');
  const csv = ['Account,' + header, ...rows.map(row => 'FIRST,' + row), ...rows.map(row => 'SECOND,' + row)].join('\n');
  const result = await parseCSV(Buffer.from(csv), 'auto', { selectedAccountId: 'DESTINATION' });
  expect(result.trades).toHaveLength(2);
  expect(result.trades.every(trade => trade.account_identifier === 'DESTINATION')).toBe(true);
});
