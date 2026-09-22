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

describe('IBKR Activity Statement options regressions (September 18)', () => {
  const header = 'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code';
  const statement = (symbol, exitPrice = 7) => [
    'Statement,Header,Field Name,Field Value',
    'Statement,Data,Title,Activity Statement',
    header,
    `Trades,Data,Order,Equity and Index Options,USD,${symbol},"2026-09-16, 09:30:00",2,5,5,-1000,-1,1001,0,0,O`,
    `Trades,Data,Order,Equity and Index Options,USD,${symbol},"2026-09-17, 10:00:00",-2,${exitPrice},${exitPrice},1400,-1,-1001,398,0,C`,
    'Trades,SubTotal,,Equity and Index Options,USD,AAPL,,0,,,400,-2,0,398,0,',
    'Trades,Total,,Equity and Index Options,USD,,,,,,400,-2,0,398,0,',
    `Trades,Data,Total,Equity and Index Options,USD,${symbol},"2026-09-17, 10:00:00",-2,7,7,1400,-1,-1001,398,0,C`,
    'Trades,Notes,This is not an execution',
    'Other Section,Data,Order,Stocks,USD,FAKE,"2026-09-17, 10:00:00",10,100'
  ].join('\n');

  test.each(['AAPL 18SEP26 200 C', 'AAPL 18SEP26 200 CALL', 'AAPL  260918C00200000'])(
    'imports %s with contract quantity, costs, and P&L', async symbol => {
      const result = await parseCSV(Buffer.from(statement(symbol)), 'ibkr', { tradeGroupingSettings: { enabled: false } });
      expect(result.trades).toHaveLength(1);
      expect(result.trades[0]).toMatchObject({ instrumentType: 'option', optionType: 'call', quantity: 2, entryPrice: 5, exitPrice: 7, commission: 2, pnl: 398 });
      expect(result.diagnostics.totalRows).toBe(2);
      expect(result.diagnostics.skippedRows).toBe(0);
    }
  );

  test('accepts a zero-price option close', async () => {
    const result = await parseCSV(Buffer.from(statement('AAPL 18SEP26 200 P', 0)), 'auto');
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({ instrumentType: 'option', optionType: 'put', exitPrice: 0, pnl: -1002 });
  });

  test('reports unidentified option contracts instead of importing them as stock', async () => {
    const result = await parseCSV(Buffer.from(statement('UNRECOGNIZED')), 'ibkr');
    expect(result.trades).toHaveLength(0);
    expect(result.diagnostics.skippedRows).toBe(2);
    expect(result.diagnostics.skippedReasons[0].reason).toContain('Option contract could not be identified');
  });
});

// The retained filled-orders samples report paid fees as "-0.75 USD".
test('filled-orders CSV includes signed execution fees in net P&L', async () => {
  const csv = [
    'Date/Time;Symbol;Side;Quantity;Price;Execution fee;Net P/L;Trading exchange;Symb. type;',
    '9/17/2026 10:00:00 AM;AMD;Sell;5;105;-0.75 USD;23.50 USD;US;Equities;',
    '9/17/2026 9:30:00 AM;AMD;Buy;5;100;-0.75 USD;;US;Equities;'
  ].join('\n');
  const result = await parseCSV(Buffer.from(csv), 'auto');
  expect(result.trades).toHaveLength(1);
  expect(result.trades[0]).toMatchObject({ quantity: 5, commission: 1.5, pnl: 23.5 });
  const { computeTradePnl } = require('../../src/services/pnlEngine');
  const stored = computeTradePnl({ side: 'long', instrumentType: 'stock', executions: result.trades[0].executions, fallbackCommission: result.trades[0].commission });
  expect(stored.aggregate.pnl).toBeCloseTo(23.5);
  expect(stored.aggregate.commission + stored.aggregate.fees).toBeCloseTo(1.5);
});
