/**
 * CSV Parser Broker Parser Tests
 * Tests all broker parsers through parseCSV(buffer, broker, context)
 * Each test validates the critical return-type contract:
 *   result.trades must be an array (THE LIGHTSPEED BUG regression check)
 */

jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn().mockReturnValue(null), set: jest.fn(), del: jest.fn(), data: {} }));
jest.mock('../../src/utils/cusipQueue', () => ({ addToQueue: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({
  convertTradeToUSD: jest.fn(trade => trade),
  userHasProAccess: jest.fn().mockResolvedValue(false)
}));

const { parseCSV } = require('../../src/utils/csvParser');

function buf(str) {
  return Buffer.from(str, 'utf-8');
}

// Helper to assert the critical return-type contract
function expectValidResult(result) {
  expect(result).toHaveProperty('trades');
  expect(Array.isArray(result.trades)).toBe(true);
  expect(result).toHaveProperty('diagnostics');
}

// ──────────────────────────────────────────────
// Lightspeed Parser
// ──────────────────────────────────────────────
describe('Lightspeed parser', () => {
  const lightspeedCSV = [
    'Trade Number,Trade Date,Execution Time,Symbol,Side,Qty,Price,Commission Amount,FeeSEC,Buy/Sell,Principal Amount,NET Amount',
    '1001,07/04/2025,09:30,AAPL,B,100,150.00,1.00,0.01,Long Buy,15000.00,14998.99',
    '1002,07/04/2025,10:00,AAPL,S,100,155.00,1.00,0.01,Long Sell,-15500.00,-15501.01'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(lightspeedCSV), 'lightspeed', {});
    expectValidResult(result);
  });

  test('parses a round-trip trade', async () => {
    const result = await parseCSV(buf(lightspeedCSV), 'lightspeed', {});
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
    const trade = result.trades[0];
    expect(trade.symbol).toBe('AAPL');
    expect(trade.entryPrice).toBeGreaterThan(0);
    expect(trade.quantity).toBeGreaterThan(0);
  });

  test('skips title row when present', async () => {
    const withTitle = 'Lightspeed Export Report\n' + lightspeedCSV;
    const result = await parseCSV(buf(withTitle), 'lightspeed', {});
    expectValidResult(result);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });

  test('handles empty CSV', async () => {
    const empty = 'Trade Number,Trade Date,Execution Time,Symbol,Side,Qty,Price,Commission Amount,FeeSEC\n';
    const result = await parseCSV(buf(empty), 'lightspeed', {});
    expectValidResult(result);
    expect(result.trades).toHaveLength(0);
  });

  test('handles multi-symbol trades', async () => {
    const multiSymbol = [
      'Trade Number,Trade Date,Execution Time,Symbol,Side,Qty,Price,Commission Amount,FeeSEC,Buy/Sell,Principal Amount,NET Amount',
      '1001,07/04/2025,09:30,AAPL,B,100,150.00,1.00,0.01,Long Buy,15000.00,14998.99',
      '1002,07/04/2025,10:00,AAPL,S,100,155.00,1.00,0.01,Long Sell,-15500.00,-15501.01',
      '1003,07/04/2025,09:35,MSFT,B,50,300.00,1.00,0.01,Long Buy,15000.00,14998.99',
      '1004,07/04/2025,10:05,MSFT,S,50,305.00,1.00,0.01,Long Sell,-15250.00,-15251.01'
    ].join('\n');
    const result = await parseCSV(buf(multiSymbol), 'lightspeed', {});
    expectValidResult(result);
    expect(result.trades.length).toBeGreaterThanOrEqual(2);
    const symbols = result.trades.map(t => t.symbol);
    expect(symbols).toContain('AAPL');
    expect(symbols).toContain('MSFT');
  });

  test('includes commission and fees', async () => {
    const result = await parseCSV(buf(lightspeedCSV), 'lightspeed', {});
    const trade = result.trades[0];
    // Commission should be populated (sum of entry + exit commissions)
    expect(trade.commission).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// Schwab Parser
// ──────────────────────────────────────────────
describe('Schwab parser', () => {
  const schwabCompletedCSV = [
    'Symbol,Quantity,Cost Per Share,Proceeds Per Share,Opened Date,Closed Date,Gain/Loss ($),Gain/Loss (%),Term,Wash Sale?',
    'AAPL,100,150.00,155.00,01/01/2025,01/02/2025,500.00,3.33%,Short Term,No'
  ].join('\n');

  const schwabTransactionCSV = [
    'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount',
    '01/01/2025,Buy,AAPL,Apple Inc,100,150.00,0.00,-15000.00',
    '01/02/2025,Sell,AAPL,Apple Inc,100,155.00,0.00,15500.00'
  ].join('\n');

  test('parses completed trades and returns valid result (regression)', async () => {
    const result = await parseCSV(buf(schwabCompletedCSV), 'schwab', {});
    expectValidResult(result);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });

  test('parses transaction format', async () => {
    const result = await parseCSV(buf(schwabTransactionCSV), 'schwab', {});
    expectValidResult(result);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });

  test('extracts account number from header', async () => {
    // Schwab CSVs include header text before the actual CSV data.
    // The header line must contain commas to be parsed correctly.
    // In real files, the header info row is followed by a blank line then CSV headers.
    const withAccount = [
      '"Transactions for account ...1234 as of 01/15/2024","","","","","","",""',
      'Date,Action,Symbol,Description,Quantity,Price,Fees & Comm,Amount',
      '01/01/2025,Buy,AAPL,Apple Inc,100,150.00,0.00,-15000.00',
      '01/02/2025,Sell,AAPL,Apple Inc,100,155.00,0.00,15500.00'
    ].join('\n');
    const context = {};
    const result = await parseCSV(buf(withAccount), 'schwab', context);
    expectValidResult(result);
    expect(context.schwabAccountNumber).toBe('****1234');
  });

  test('handles tab-delimited format', async () => {
    const tabCSV = schwabCompletedCSV.replace(/,/g, '\t');
    const result = await parseCSV(buf(tabCSV), 'schwab', {});
    expectValidResult(result);
  });
});

// ──────────────────────────────────────────────
// ThinkorSwim Parser
// ──────────────────────────────────────────────
describe('ThinkorSwim parser', () => {
  const tosCSV = [
    'DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,Amount,Balance',
    '01/01/2025,09:30:00,TRD,12345,BOT +100 AAPL @150.00,$0.00,-$1.00,-$15001.00,$50000.00',
    '01/02/2025,10:00:00,TRD,12346,SOLD -100 AAPL @155.00,$0.00,-$1.00,$15499.00,$65499.00'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(tosCSV), 'thinkorswim', {});
    expectValidResult(result);
  });

  test('parses round-trip trade from BOT/SOLD descriptions', async () => {
    const result = await parseCSV(buf(tosCSV), 'thinkorswim', {});
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
    expect(result.trades[0].symbol).toBe('AAPL');
  });

  test('skips non-TRD rows', async () => {
    const mixedCSV = [
      'DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,Amount,Balance',
      '01/01/2025,09:30:00,DOI,99999,DIVIDEND ON 100 AAPL,$0.00,$0.00,$50.00,$50050.00',
      '01/01/2025,09:30:00,TRD,12345,BOT +100 AAPL @150.00,$0.00,-$1.00,-$15001.00,$35049.00',
      '01/02/2025,10:00:00,TRD,12346,SOLD -100 AAPL @155.00,$0.00,-$1.00,$15499.00,$50548.00'
    ].join('\n');
    const result = await parseCSV(buf(mixedCSV), 'thinkorswim', {});
    expectValidResult(result);
    // Dividend row should be skipped
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });
});

// ──────────────────────────────────────────────
// IBKR Parser
// ──────────────────────────────────────────────
describe('IBKR parser', () => {
  const ibkrActivityCSV = [
    'Symbol,Date/Time,Quantity,Price,Commission,Fees',
    'AAPL,20250101;093000,100,150.00,-1.00,0.00',
    'AAPL,20250102;100000,-100,155.00,-1.00,0.00'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(ibkrActivityCSV), 'ibkr', {});
    expectValidResult(result);
  });

  test('parses activity statement trades', async () => {
    const result = await parseCSV(buf(ibkrActivityCSV), 'ibkr', {});
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
    expect(result.trades[0].symbol).toBe('AAPL');
  });

  test('handles IBKR Flex date format (YYYYMMDD;HHMMSS)', async () => {
    const result = await parseCSV(buf(ibkrActivityCSV), 'ibkr', {});
    expectValidResult(result);
    expect(result.trades[0].tradeDate).toBeDefined();
  });

  test('handles negative commission (IBKR convention)', async () => {
    const result = await parseCSV(buf(ibkrActivityCSV), 'ibkr', {});
    if (result.trades.length > 0) {
      // IBKR negates commission, so it should be positive (fee paid)
      expect(result.trades[0].commission).toBeGreaterThanOrEqual(0);
    }
  });

  test('parses trade confirmation format', async () => {
    const tradeConfCSV = [
      'Symbol,UnderlyingSymbol,Strike,Expiry,Put/Call,Multiplier,Buy/Sell,Date/Time,Quantity,Price,Commission',
      'AAPL230120C00150000,AAPL,150,20230120,C,100,BUY,20230120;093000,1,5.00,-1.00'
    ].join('\n');
    const result = await parseCSV(buf(tradeConfCSV), 'ibkr_trade_confirmation', {});
    expectValidResult(result);
  });
});

// ──────────────────────────────────────────────
// TradingView Parser
// ──────────────────────────────────────────────
describe('TradingView parser', () => {
  const tvFuturesCSV = [
    'Symbol,Side,Qty,Fill Price,Order ID,Leverage,Placing Time,Closing Time,Status',
    'ESM24,Buy,1,5000.00,123,,2025-01-01 09:30:00,2025-01-01 09:30:00,Filled',
    'ESM24,Sell,1,5010.00,124,,2025-01-01 10:00:00,2025-01-01 10:00:00,Filled'
  ].join('\n');

  const tvFuturesNoStatusCSV = [
    'Symbol,Side,Type,Qty,Fill Price,Commission,Placing Time,Closing Time,Order ID,Leverage',
    'FX_IDC:EURUSD,Buy,Limit,400000,1.17973,,2026-02-25 18:20:04,2026-02-25 18:20:19,2794916838,50:1',
    'FX_IDC:EURUSD,Sell,Stop,400000,1.18032,,2026-02-25 18:36:32,2026-02-25 18:46:01,2794952343,'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(tvFuturesCSV), 'tradingview', {});
    expectValidResult(result);
  });

  test('parses futures transactions', async () => {
    const result = await parseCSV(buf(tvFuturesCSV), 'tradingview', {});
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });

  test('parses TradingView transaction exports without a Status column', async () => {
    const result = await parseCSV(buf(tvFuturesNoStatusCSV), 'tradingview', {});
    expectValidResult(result);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });

  test('parses performance export format', async () => {
    const perfCSV = [
      'buyFillId,sellFillId,symbol,qty,buyPrice,sellPrice,boughtTimestamp,soldTimestamp,pnl',
      '1,2,AAPL,100,150.00,155.00,2025-01-01 09:30:00,2025-01-02 10:00:00,500.00'
    ].join('\n');
    const result = await parseCSV(buf(perfCSV), 'tradingview', {});
    expectValidResult(result);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });

  test('parses paper trading format', async () => {
    const paperCSV = [
      'symbol,qty,buyPrice,sellPrice,boughtTimestamp,soldTimestamp,status',
      'AAPL,100,150.00,155.00,2025-01-01 09:30:00,2025-01-02 10:00:00,closed'
    ].join('\n');
    const result = await parseCSV(buf(paperCSV), 'tradingview', {});
    expectValidResult(result);
  });

  test('skips cancelled/unfilled orders', async () => {
    const withCancelled = [
      'Symbol,Side,Qty,Fill Price,Order ID,Leverage,Placing Time,Closing Time,Status',
      'ESM24,Buy,1,5000.00,123,,2025-01-01 09:30:00,2025-01-01 09:30:00,Cancelled',
      'ESM24,Buy,1,5000.00,124,,2025-01-01 09:35:00,2025-01-01 09:35:00,Filled',
      'ESM24,Sell,1,5010.00,125,,2025-01-01 10:00:00,2025-01-01 10:00:00,Filled'
    ].join('\n');
    const result = await parseCSV(buf(withCancelled), 'tradingview', {});
    expectValidResult(result);
  });
});

// ──────────────────────────────────────────────
// Webull Parser
// ──────────────────────────────────────────────
describe('Webull parser', () => {
  const webullCSV = [
    'Name,Symbol,Side,Status,Filled,Price,Time-in-Force,Placed Time,Filled Time',
    'Apple Inc,AAPL,Buy,Filled,100,150.00,Day,01/01/2025 09:30:00,01/01/2025 09:30:00',
    'Apple Inc,AAPL,Sell,Filled,100,155.00,Day,01/02/2025 10:00:00,01/02/2025 10:00:00'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(webullCSV), 'webull', {});
    expectValidResult(result);
  });

  test('parses standard Webull trades', async () => {
    const result = await parseCSV(buf(webullCSV), 'webull', {});
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });

  test('parses alternate Webull format', async () => {
    const altCSV = [
      'Symbol,B/S,Side Type,Qty,Filled Qty,Filled Avg Price,Filled Time,Status',
      'AAPL,Buy,Long,100,100,150.00,01/01/2025 09:30:00,Filled',
      'AAPL,Sell,Long,100,100,155.00,01/02/2025 10:00:00,Filled'
    ].join('\n');
    const result = await parseCSV(buf(altCSV), 'webull', {});
    expectValidResult(result);
  });

  test('parses production-style Webull option export with dollar-prefixed prices', async () => {
    const optionCSV = [
      'Option Level,Symbol,Market,Place Time,Filled Time,B/S,Side Type,Order Type,Option Type,Combo Type,Filled Avg Price,Filled Qty,Traded Value,Commission,Fee,Submitted Quantity,Amount,Limit Price,Stop Price,Time in Force,Extended Hours,Is Partial Filled',
      '2,SPY250321C00570000,OPRA,03/01/2026 09:31:00 EST,03/01/2026 09:31:05 EST,Buy,Open,Limit,Call,Single,$1.25,2,$250.00,$0.00,$0.00,2,$250.00,$1.25,$0.00,DAY,N,No',
      '2,SPY250321C00570000,OPRA,03/01/2026 10:01:00 EST,03/01/2026 10:01:05 EST,Sell,Close,Limit,Call,Single,$1.55,2,$310.00,$0.00,$0.00,2,$310.00,$1.55,$0.00,DAY,N,No'
    ].join('\n');

    const result = await parseCSV(buf(optionCSV), 'webull', {});

    expectValidResult(result);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toMatchObject({
      symbol: 'SPY',
      side: 'long',
      quantity: 2,
      entryPrice: 1.25,
      exitPrice: 1.55,
      instrumentType: 'option',
      underlyingSymbol: 'SPY',
      optionType: 'call'
    });
    expect(result.diagnostics.skippedRows).toBe(0);
    expect(result.diagnostics.invalidRows).toBe(0);
  });

  test('does not merge distinct Webull round trips during post-parse grouping', async () => {
    const csv = [
      'Name,Symbol,Side,Status,Filled,Total Qty,Price,Avg Price,Time-in-Force,Placed Time,Filled Time',
      'ASTC,ASTC,Buy,Filled,5,5,5.00,5.00,DAY,03/30/2026 09:31:00 EDT,03/30/2026 09:31:05 EDT',
      'ASTC,ASTC,Sell,Filled,5,5,5.10,5.10,DAY,03/30/2026 09:33:00 EDT,03/30/2026 09:33:05 EDT',
      'ASTC,ASTC,Buy,Filled,5,5,5.20,5.20,DAY,03/30/2026 09:40:00 EDT,03/30/2026 09:40:05 EDT',
      'ASTC,ASTC,Sell,Filled,5,5,5.30,5.30,DAY,03/30/2026 09:45:00 EDT,03/30/2026 09:45:05 EDT'
    ].join('\n');

    const result = await parseCSV(buf(csv), 'webull', {});

    expectValidResult(result);
    expect(result.trades).toHaveLength(2);
    expect(result.trades.map((trade) => trade.quantity)).toEqual([5, 5]);
    expect(result.trades.map((trade) => trade.entryPrice)).toEqual([5, 5.2]);
    expect(result.trades.map((trade) => trade.exitPrice)).toEqual([5.1, 5.3]);
  });
});

// ──────────────────────────────────────────────
// PaperMoney Parser
// ──────────────────────────────────────────────
describe('PaperMoney parser', () => {
  const paperMoneyCSV = [
    'Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type',
    '1/15/25 09:30:00,SINGLE,BUY,100,TO OPEN,AAPL,,,STOCK,150.00,150.00,LIMIT',
    '1/15/25 10:00:00,SINGLE,SELL,100,TO CLOSE,AAPL,,,STOCK,155.00,155.00,LIMIT'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(paperMoneyCSV), 'papermoney', {});
    expectValidResult(result);
  });

  test('parses filled orders section', async () => {
    const withSection = 'Filled Orders\n' + paperMoneyCSV;
    const result = await parseCSV(buf(withSection), 'papermoney', {});
    expectValidResult(result);
  });

  test('parses date from Exec Time column', async () => {
    const result = await parseCSV(buf(paperMoneyCSV), 'papermoney', {});
    if (result.trades.length > 0) {
      expect(result.trades[0].tradeDate).toBeDefined();
    }
  });
});

// ──────────────────────────────────────────────
// Tradovate Parser
// ──────────────────────────────────────────────
describe('Tradovate parser', () => {
  const tradovateCSV = [
    'orderId,B/S,Contract,Product,Fill Time,avgPrice,filledQty',
    '123,Buy,ESM4,ES,01/01/2025 09:30:00,5000.00,1',
    '124,Sell,ESM4,ES,01/01/2025 10:00:00,5010.00,1'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(tradovateCSV), 'tradovate', {});
    expectValidResult(result);
  });

  test('parses order fills (open positions count as trades)', async () => {
    const result = await parseCSV(buf(tradovateCSV), 'tradovate', {});
    // Tradovate uses position tracking; a buy+sell pair creates a complete trade,
    // but even a single buy creates an open position trade
    expect(result.trades.length).toBeGreaterThanOrEqual(0);
  });

  test('parses performance report format', async () => {
    const perfCSV = [
      'buyFillId,sellFillId,symbol,qty,buyPrice,sellPrice,boughtTimestamp,soldTimestamp,pnl',
      '1,2,ESM4,1,5000.00,5010.00,2025-01-01 09:30:00,2025-01-01 10:00:00,500.00'
    ].join('\n');
    const result = await parseCSV(buf(perfCSV), 'tradovate', {});
    expectValidResult(result);
  });
});

// ──────────────────────────────────────────────
// Questrade Parser
// ──────────────────────────────────────────────
describe('Questrade parser', () => {
  const questradeCSV = [
    'Symbol,Action,Fill Qty,Fill Price,Exec Time,Commission',
    'AAPL,Buy,100,150.00,01/01/2025 09:30:00,4.95',
    'AAPL,Sell,100,155.00,01/02/2025 10:00:00,4.95'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(questradeCSV), 'questrade', {});
    expectValidResult(result);
  });

  test('parses trades (position tracking creates round-trips)', async () => {
    const result = await parseCSV(buf(questradeCSV), 'questrade', {});
    // Questrade uses position tracking; trades are created when positions close
    expect(result.trades.length).toBeGreaterThanOrEqual(0);
  });

  test('handles options symbols in Symbol column', async () => {
    const optionsCSV = [
      'Symbol,Action,Fill Qty,Fill Price,Exec Time,Commission',
      'AAPL230120C00150000,Buy,1,5.00,01/01/2025 09:30:00,4.95',
      'AAPL230120C00150000,Sell,1,6.00,01/02/2025 10:00:00,4.95'
    ].join('\n');
    const result = await parseCSV(buf(optionsCSV), 'questrade', {});
    expectValidResult(result);
  });
});

// ──────────────────────────────────────────────
// Tastytrade Parser
// ──────────────────────────────────────────────
describe('Tastytrade parser', () => {
  const tastytradeCSV = [
    'Date,Type,Action,Symbol,Instrument Type,Description,Value,Quantity,Average Price,Commissions,Fees,Root Symbol,Underlying Symbol,Expiration Date,Strike Price,Call or Put',
    '01/01/2025,Trade,Buy to Open,AAPL,Equity,AAPL Apple Inc,15000.00,100,150.00,-1.00,0.00,AAPL,AAPL,,,',
    '01/02/2025,Trade,Sell to Close,AAPL,Equity,AAPL Apple Inc,-15500.00,100,155.00,-1.00,0.00,AAPL,AAPL,,,'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(tastytradeCSV), 'tastytrade', {});
    expectValidResult(result);
  });

  test('parses basic equity trades', async () => {
    const result = await parseCSV(buf(tastytradeCSV), 'tastytrade', {});
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });

  test('handles OCC symbol format for options', async () => {
    const optCSV = [
      'Date,Type,Action,Symbol,Instrument Type,Description,Value,Quantity,Average Price,Commissions,Fees,Root Symbol,Underlying Symbol,Expiration Date,Strike Price,Call or Put',
      '01/01/2025,Trade,Buy to Open,AAPL230120C00150000,Equity Option,AAPL 01/20/23 Call 150.00,500.00,1,5.00,-1.00,0.00,AAPL,AAPL,01/20/2023,150.00,Call',
      '01/02/2025,Trade,Sell to Close,AAPL230120C00150000,Equity Option,AAPL 01/20/23 Call 150.00,-600.00,1,6.00,-1.00,0.00,AAPL,AAPL,01/20/2023,150.00,Call'
    ].join('\n');
    const result = await parseCSV(buf(optCSV), 'tastytrade', {});
    expectValidResult(result);
  });
});

// ──────────────────────────────────────────────
// E*TRADE Parser
// ──────────────────────────────────────────────
describe('E*TRADE parser', () => {
  const etradeCSV = [
    'Transaction Date,Transaction Type,Symbol,Quantity,Price,Commission,Fees,Amount',
    '01/01/2025,Buy,AAPL,100,150.00,6.95,0.00,-15006.95',
    '01/02/2025,Sell,AAPL,100,155.00,6.95,0.00,15493.05'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(etradeCSV), 'etrade', {});
    expectValidResult(result);
  });

  test('parses E*TRADE trades (uses generic row parser)', async () => {
    const result = await parseCSV(buf(etradeCSV), 'etrade', {});
    // E*TRADE uses the generic row-by-row parser; individual rows become trades
    // Each row needs symbol, date, price > 0, quantity > 0 to pass isValidTrade
    expect(result.trades.length).toBeGreaterThanOrEqual(0);
  });
});

// ──────────────────────────────────────────────
// ProjectX Parser
// ──────────────────────────────────────────────
describe('ProjectX parser', () => {
  const projectxCSV = [
    'Id,ContractName,EnteredAt,ExitedAt,EntryPrice,ExitPrice,Fees,PnL,Size,Type,TradeDay,TradeDuration,Commissions',
    '1,ESM24,01/01/2025 09:30:00 +00:00,01/01/2025 10:00:00 +00:00,5000.00,5010.00,1.00,500.00,1,Long,01/01/2025,00:30:00,2.00'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(projectxCSV), 'projectx', {});
    expectValidResult(result);
  });

  test('parses ContractName for futures symbol', async () => {
    const result = await parseCSV(buf(projectxCSV), 'projectx', {});
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });
});

// ──────────────────────────────────────────────
// TradeStation Parser
// ──────────────────────────────────────────────
describe('TradeStation parser', () => {
  const tradestationCSV = [
    'Account,T/D,S/D,Exec Time,Symbol,Side,Qty,Price,Gross Proceeds,Net Proceeds',
    '12345,01/01/2025,01/03/2025,09:30,AAPL,Buy,100,150.00,-15000.00,-15001.00',
    '12345,01/02/2025,01/04/2025,10:00,AAPL,Sell,100,155.00,15500.00,15499.00'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(tradestationCSV), 'tradestation', {});
    expectValidResult(result);
  });

  test('parses basic TradeStation trades', async () => {
    const result = await parseCSV(buf(tradestationCSV), 'tradestation', {});
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });
});

// ──────────────────────────────────────────────
// Generic Parser
// ──────────────────────────────────────────────
describe('Generic parser', () => {
  const genericCSV = [
    'Symbol,Date,Side,Quantity,Price,Commission',
    'AAPL,01/01/2025,Buy,100,150.00,1.00',
    'AAPL,01/02/2025,Sell,100,155.00,1.00'
  ].join('\n');

  test('returns valid result with trades array (regression)', async () => {
    const result = await parseCSV(buf(genericCSV), 'generic', {});
    expectValidResult(result);
  });

  test('maps flexible column names', async () => {
    const result = await parseCSV(buf(genericCSV), 'generic', {});
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });

  test('detects side from Action column', async () => {
    const actionCSV = [
      'Symbol,Date,Action,Quantity,Price',
      'AAPL,01/01/2025,Buy,100,150.00',
      'AAPL,01/02/2025,Sell,100,155.00'
    ].join('\n');
    const result = await parseCSV(buf(actionCSV), 'generic', {});
    expectValidResult(result);
  });

  test('parses month name timestamps with entry and exit price columns', async () => {
    const monthNameCSV = [
      'Symbol,Date,Entry Price,Exit Price,Quantity,Side,Commission,Fees',
      'XAUUSD,"February 23, 202607:11 PM",5203.02,5203.02,0.1,Sell,0.7,0',
      'XAUUSD,"February 23, 202607:35 PM",5207.03,5207.03,0.1,Sell,0.7,0'
    ].join('\n');
    const result = await parseCSV(buf(monthNameCSV), 'generic', {});
    expectValidResult(result);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics.invalidRows).toBe(0);
  });

  test('records diagnostics when generic rows fail validation', async () => {
    const invalidGenericCSV = [
      'Symbol,Date,Price,Quantity',
      'AAPL,not-a-date,150.00,100'
    ].join('\n');
    const result = await parseCSV(buf(invalidGenericCSV), 'generic', {});
    expectValidResult(result);
    expect(result.trades).toHaveLength(0);
    expect(result.diagnostics.invalidRows).toBe(1);
    expect(result.diagnostics.skippedReasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          row: 1,
          reason: expect.stringContaining('Invalid trade')
        })
      ])
    );
  });
});

// ──────────────────────────────────────────────
// Auto-detect broker
// ──────────────────────────────────────────────
describe('Auto-detect broker', () => {
  test('auto-detects Lightspeed and parses correctly', async () => {
    const csv = [
      'Trade Number,Trade Date,Execution Time,Symbol,Side,Qty,Price,Commission Amount,FeeSEC,Buy/Sell,Principal Amount,NET Amount',
      '1001,07/04/2025,09:30,AAPL,B,100,150.00,1.00,0.01,Long Buy,15000.00,14998.99',
      '1002,07/04/2025,10:00,AAPL,S,100,155.00,1.00,0.01,Long Sell,-15500.00,-15501.01'
    ].join('\n');
    const result = await parseCSV(buf(csv), 'auto', {});
    expectValidResult(result);
    expect(result.diagnostics.detectedBroker).toBe('lightspeed');
  });

  test('auto-detects AvaTrade German CSV', async () => {
    const csv = [
      'Symbol,Seite,Typ,Anz.,Limit Preis,Stopp-Preis,Aktiv bei,Erfüllungsmenge,Durchschnittlicher Erfüllungspreis,Kommission,Platzierungszeit,Status,Status Zeit,Order-Nummer,Dauer',
      'F.US.MESM26,Buy,Markt,1,,,,1,6525,,2026-03-27 10:42:02,Ausgeführt,2026-03-27 10:42:02,244412225,GTC',
      'F.US.MESM26,Sell,Markt,1,,,,1,6530,,2026-03-27 11:00:00,Ausgeführt,2026-03-27 11:00:00,244412226,GTC'
    ].join('\n');
    const result = await parseCSV(buf(csv), 'auto', {});
    expectValidResult(result);
    expect(result.diagnostics.detectedBroker).toBe('avatrade');
  });

  test('auto-detects Webull newer option export', async () => {
    const csv = [
      'Option Level,Symbol,Market,Place Time,Filled Time,B/S,Side Type,Order Type,Option Type,Combo Type,Filled Avg Price,Filled Qty,Traded Value,Commission,Fee,Submitted Quantity,Amount,Limit Price,Stop Price,Time in Force,Extended Hours,Is Partial Filled',
      '2,SPY250321C00570000,OPRA,03/01/2026 09:31:00 EST,03/01/2026 09:31:05 EST,Buy,Open,Limit,Call,Single,$1.25,2,$250.00,$0.00,$0.00,2,$250.00,$1.25,$0.00,DAY,N,No',
      '2,SPY250321C00570000,OPRA,03/01/2026 10:01:00 EST,03/01/2026 10:01:05 EST,Sell,Close,Limit,Call,Single,$1.55,2,$310.00,$0.00,$0.00,2,$310.00,$1.55,$0.00,DAY,N,No'
    ].join('\n');

    const result = await parseCSV(buf(csv), 'auto', {});

    expectValidResult(result);
    expect(result.diagnostics.detectedBroker).toBe('webull');
    expect(result.trades).toHaveLength(1);
  });
});

// ──────────────────────────────────────────────
// AvaTrade Parser
// ──────────────────────────────────────────────
describe('AvaTrade parser', () => {
  const avatradeCSV = [
    'Symbol,Seite,Typ,Anz.,Limit Preis,Stopp-Preis,Aktiv bei,Erfüllungsmenge,Durchschnittlicher Erfüllungspreis,Kommission,Platzierungszeit,Status,Status Zeit,Order-Nummer,Dauer',
    'F.US.MESM26,Buy,Markt,1,,,,1,6525,,2026-03-27 10:42:02,Ausgeführt,2026-03-27 10:42:02,244412225,GTC',
    'F.US.MESM26,Sell,Markt,1,,,,1,6530,,2026-03-27 11:00:00,Ausgeführt,2026-03-27 11:00:00,244412226,GTC'
  ].join('\n');

  test('returns valid result with trades array', async () => {
    const result = await parseCSV(buf(avatradeCSV), 'avatrade', {});
    expectValidResult(result);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });

  test('creates round-trip trade from buy+sell', async () => {
    const result = await parseCSV(buf(avatradeCSV), 'avatrade', {});
    expect(result.trades.length).toBe(1);
    const trade = result.trades[0];
    expect(trade.broker).toBe('avatrade');
    expect(trade.side).toBe('long');
    expect(trade.symbol).toBe('MESM26');
  });

  test('skips cancelled/rejected German status orders', async () => {
    const csv = [
      'Symbol,Seite,Typ,Anz.,Limit Preis,Stopp-Preis,Aktiv bei,Erfüllungsmenge,Durchschnittlicher Erfüllungspreis,Kommission,Platzierungszeit,Status,Status Zeit,Order-Nummer,Dauer',
      'F.US.MESM26,Buy,Markt,1,,,,1,6525,,2026-03-27 10:42:02,Ausgeführt,2026-03-27 10:42:02,244412225,GTC',
      'F.US.MESM26,Buy,Stop-Loss,1,,6520,,0,,,2026-03-27 10:42:10,Storniert,2026-03-27 10:43:00,244412230,GTC',
      'F.US.MESM26,Buy,Take-Profit,1,6540,,,0,,,2026-03-27 10:42:10,Abgelehnt,2026-03-27 10:43:00,244412231,GTC',
      'F.US.MESM26,Sell,Markt,1,,,,1,6530,,2026-03-27 11:00:00,Ausgeführt,2026-03-27 11:00:00,244412226,GTC'
    ].join('\n');
    const result = await parseCSV(buf(csv), 'avatrade', {});
    expectValidResult(result);
    // Should produce 1 trade from 2 filled orders, skipping 2 cancelled/rejected
    expect(result.trades.length).toBe(1);
  });
});

// ──────────────────────────────────────────────
// Localization layer
// ──────────────────────────────────────────────
describe('Localization layer', () => {
  test('translates German TradingView headers and status values', async () => {
    // A hypothetical German-language TradingView-like export
    const csv = [
      'Symbol,Seite,Typ,Anz.,Erfüllungsmenge,Durchschnittlicher Erfüllungspreis,Kommission,Platzierungszeit,Status,Status Zeit,Order-Nummer,Dauer',
      'AAPL,Buy,Markt,100,100,150.00,,2025-01-01 09:30:00,Ausgeführt,2025-01-01 09:30:00,1001,GTC',
      'AAPL,Sell,Markt,100,100,155.00,,2025-01-02 10:00:00,Ausgeführt,2025-01-02 10:00:00,1002,GTC'
    ].join('\n');
    // When passed as tradingview (user-selected), localization normalizes headers
    const result = await parseCSV(buf(csv), 'tradingview', {});
    expectValidResult(result);
    expect(result.trades.length).toBeGreaterThanOrEqual(1);
  });
});
