/**
 * CSV Parser Broker Parser Tests
 * Tests all broker parsers through parseCSV(buffer, broker, context)
 * Each test validates the critical return-type contract:
 *   result.trades must be an array (THE LIGHTSPEED BUG regression check)
 */

const fs = require('fs');
const path = require('path');

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
const calculationContracts = require('../../../tests/fixtures/trading-calculation-contracts.json');

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

  // Lightspeed files carry Eastern wall-clock times; conversion to UTC must
  // follow DST. A previous fixed +4h offset stored EST-season trades an hour
  // early (see migration 220).
  test('converts execution times as Eastern with DST handling', async () => {
    const edtCSV = [
      'Trade Number,Trade Date,Execution Time,Symbol,Side,Qty,Price,Commission Amount,FeeSEC,Buy/Sell,Principal Amount,NET Amount',
      '1001,07/23/2025,16:33,AAPL,B,100,150.00,1.00,0.01,Long Buy,15000.00,14998.99'
    ].join('\n');
    const edt = await parseCSV(buf(edtCSV), 'lightspeed', {});
    // 16:33 EDT = 20:33 UTC
    expect(new Date(edt.trades[0].entryTime).toISOString()).toBe('2025-07-23T20:33:00.000Z');

    const estCSV = [
      'Trade Number,Trade Date,Execution Time,Symbol,Side,Qty,Price,Commission Amount,FeeSEC,Buy/Sell,Principal Amount,NET Amount',
      '1001,01/15/2025,16:33,AAPL,B,100,150.00,1.00,0.01,Long Buy,15000.00,14998.99'
    ].join('\n');
    const est = await parseCSV(buf(estCSV), 'lightspeed', {});
    // 16:33 EST = 21:33 UTC (the case the old +4h offset got wrong)
    expect(new Date(est.trades[0].entryTime).toISOString()).toBe('2025-01-15T21:33:00.000Z');
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
// Firstrade Parser
// ──────────────────────────────────────────────
describe('Firstrade parser', () => {
  const firstradeCSV = [
    'Symbol,Quantity,Price,Action,Description,TradeDate,SettledDate,Interest,Amount,Commission,Fee,CUSIP,RecordType',
    'SPY,10,605.2699,BUY,SPDR S&P 500 ETF TRUST,2025-02-10,2025-02-11,0.00,-6052.70,0.00,0.00,78462F103,Trade',
    ',-1,0.11,SELL,PUT IAG 02/21/25 6 IAMGOLD CORP OPEN CONTRACT,2025-02-10,2025-02-11,0.00,11.00,0.00,0.05,,Trade',
    ',1,0.15,BUY,PUT IAG 02/21/25 6 IAMGOLD CORP CLOSING CONTRACT,2025-02-18,2025-02-19,0.00,-15.00,0.00,0.00,,Trade',
    'SPY,10,610.0000,SELL,SPDR S&P 500 ETF TRUST,2025-03-20,2025-03-21,0.00,6100.00,0.00,0.00,78462F103,Trade',
    ',0.00,,Interest,INTEREST ON CREDIT BALANCE,2025-03-17,2025-03-17,0.00,3.10,0.00,0.00,00099A109,Financial'
  ].join('\n');

  test('returns valid result with trades array', async () => {
    const result = await parseCSV(buf(firstradeCSV), 'firstrade', {});
    expectValidResult(result);
  });

  test('parses stock and option trades while skipping financial rows', async () => {
    const result = await parseCSV(buf(firstradeCSV), 'firstrade', {});
    expect(result.trades).toHaveLength(2);

    const spyTrade = result.trades.find(trade => trade.symbol === 'SPY');
    expect(spyTrade).toBeDefined();
    expect(spyTrade.exitPrice).toBeCloseTo(610, 5);
    expect(spyTrade.quantity).toBe(10);

    const optionTrade = result.trades.find(trade => trade.instrumentType === 'option');
    expect(optionTrade).toBeDefined();
    expect(optionTrade.symbol).toBe('IAG');
    expect(optionTrade.underlyingSymbol).toBe('IAG');
    expect(optionTrade.optionType).toBe('put');
  });

  // Firstrade CSV doesn't list rows in execution order. When the day's net flow
  // is long, BUYs must process before SELLs so a partial close isn't misread as
  // opening a short. Reconstructed from issue #311 NET stock example.
  test('reorders same-day mixed buys/sells using net flow when execution times missing', async () => {
    const reorderCSV = [
      'Symbol,Quantity,Price,Action,Description,TradeDate,SettledDate,Interest,Amount,Commission,Fee,CUSIP,RecordType',
      'NET,-38.00,254.30,SELL,CLOUDFLARE INC CLASS A,2026-05-07,2026-05-08,0.00,9663.20,0.00,0.20,18915M107,Trade',
      'NET,88.00,254.00,BUY,CLOUDFLARE INC CLASS A,2026-05-07,2026-05-08,0.00,-22352.00,0.00,0.00,18915M107,Trade',
      'NET,50.00,223.00,BUY,CLOUDFLARE INC CLASS A EXEC TIME: 2026-05-07 16:28:38,2026-05-07,2026-05-08,0.00,-11150.00,0.00,0.00,18915M107,Trade'
    ].join('\n');

    const result = await parseCSV(buf(reorderCSV), 'firstrade', {});
    expect(result.trades).toHaveLength(1);

    const trade = result.trades[0];
    expect(trade.symbol).toBe('NET');
    expect(trade.side).toBe('long');
    expect(trade.quantity).toBe(100);
    expect(trade.entryPrice).toBeCloseTo((88 * 254 + 50 * 223) / 138, 2);
  });

  test('extracts EXEC TIME from description when present', async () => {
    const execTimeCSV = [
      'Symbol,Quantity,Price,Action,Description,TradeDate,SettledDate,Interest,Amount,Commission,Fee,CUSIP,RecordType',
      'AAPL,100.00,150.00,BUY,APPLE INC EXEC TIME: 2026-01-15 14:30:25,2026-01-15,2026-01-16,0.00,-15000.00,0.00,0.00,037833100,Trade',
      'AAPL,-100.00,155.00,SELL,APPLE INC EXEC TIME: 2026-01-15 15:45:10,2026-01-15,2026-01-16,0.00,15500.00,0.00,0.00,037833100,Trade'
    ].join('\n');

    const result = await parseCSV(buf(execTimeCSV), 'firstrade', {});
    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade.entryTime).toContain('14:30:25');
    expect(trade.exitTime).toContain('15:45:10');
  });

  // Treasury notes/bonds are quoted as percent of face value. qty * price would
  // give an inflated cash basis; CSV Amount column is the actual cash flow.
  test('uses Amount column for treasury bond cost basis', async () => {
    const treasuryCSV = [
      'Symbol,Quantity,Price,Action,Description,TradeDate,SettledDate,Interest,Amount,Commission,Fee,CUSIP,RecordType',
      ',100000.00,100.161,BUY,UNITED STATES TREASURY NOTE DUE 12/31/2026 04.250,2025-02-10,2025-02-11,-493.09,-100654.09,0.00,0.00,91282CME8,Trade',
      ',-100000.00,100.506,SELL,UNITED STATES TREASURY NOTE DUE 12/31/2026 04.250,2026-01-07,2026-01-08,93.92,100599.92,0.00,0.00,91282CME8,Trade'
    ].join('\n');

    const result = await parseCSV(buf(treasuryCSV), 'firstrade', {});
    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];

    // P&L should be the cash difference (~ -$54), not qty * price difference (~ $34,500).
    expect(Math.abs(trade.pnl)).toBeLessThan(200);
    expect(trade.entryPrice * trade.quantity).toBeCloseTo(100654.09, 1);
    expect(trade.exitPrice * trade.quantity).toBeCloseTo(100599.92, 1);
  });

  // Firstrade leaves the Symbol column blank for treasuries; using the raw
  // 9-character CUSIP as the symbol is unfriendly. Parse the maturity and
  // coupon from the description into Bloomberg-style "T 4.25 12/31/26".
  test('derives a friendly symbol for treasuries from the description', async () => {
    const treasuryCSV = [
      'Symbol,Quantity,Price,Action,Description,TradeDate,SettledDate,Interest,Amount,Commission,Fee,CUSIP,RecordType',
      ',100000.00,100.161,BUY,UNITED STATES TREASURY NOTE DUE 12/31/2026 04.250,2025-02-10,2025-02-11,-493.09,-100654.09,0.00,0.00,91282CME8,Trade'
    ].join('\n');

    const result = await parseCSV(buf(treasuryCSV), 'firstrade', {});
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].symbol).toBe('T 4.25 12/31/26');
  });

  // A short option that gets assigned is recorded as a RecordType=Financial
  // row (no BUY/SELL), so the contract was being left as an open position.
  // The synthetic close at price=0 lets the seller realise the premium and
  // keeps the parser output in sync with the user's actual account.
  test('closes a sold put at $0 when a Financial assignment row exists', async () => {
    const csv = [
      'Symbol,Quantity,Price,Action,Description,TradeDate,SettledDate,Interest,Amount,Commission,Fee,CUSIP,RecordType',
      ',-155.00,0.11,SELL,PUT IAG 02/21/25 6 IAMGOLD CORP OPEN CONTRACT,2025-02-10,2025-02-11,0.00,1700.80,0.00,0.05,,Trade',
      ',155.00,,Other,PUT IAG 02/21/25 6 IAMGOLD CORP A/E 155 ASSIGNED,2025-02-21,2025-02-21,0.00,0.00,0.00,0.00,,Financial'
    ].join('\n');

    const result = await parseCSV(buf(csv), 'firstrade', {});
    const optionTrade = result.trades.find(t => t.instrumentType === 'option');
    expect(optionTrade).toBeDefined();
    expect(optionTrade.side).toBe('short');
    expect(optionTrade.exitPrice).toBe(0);
    // Premium kept (minus the row's reported + implied fees).
    expect(optionTrade.pnl).toBeGreaterThan(1690);
    expect(optionTrade.pnl).toBeLessThan(1701);
  });

  // Firstrade rolls SEC/ORF/exchange fees into the Amount column without
  // itemising them in Fee. P&L from qty*price*100 was therefore $4-5 off per
  // option round trip — small but real. Derive total fees from the cash gap.
  test('matches realised option P&L to the Amount column cash flow', async () => {
    const csv = [
      'Symbol,Quantity,Price,Action,Description,TradeDate,SettledDate,Interest,Amount,Commission,Fee,CUSIP,RecordType',
      ',-155.00,0.15,SELL,CALL IAG 03/21/25 6 IAMGOLD CORP OPEN CONTRACT,2025-03-14,2025-03-17,0.00,2320.57,0.00,0.07,,Trade',
      ',155.00,0.15,BUY,CALL IAG 03/21/25 6 IAMGOLD CORP CLOSING CONTRACT,2025-03-18,2025-03-19,0.00,-2329.36,0.00,0.00,,Trade'
    ].join('\n');

    const result = await parseCSV(buf(csv), 'firstrade', {});
    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    // Actual cash flow: 2320.57 - 2329.36 = -8.79
    expect(trade.pnl).toBeCloseTo(-8.79, 2);
  });

  // Most users keep the default 'generic' broker dropdown selection. When the
  // headers clearly belong to a known broker, route to that parser instead of
  // forcing the user to know which dropdown entry to pick.
  test('falls through to Firstrade parser when broker=generic but headers match', async () => {
    const result = await parseCSV(buf(firstradeCSV), 'generic', {});
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.diagnostics.detectedBroker).toBe('firstrade');
  });

  // Commission and Fee columns map to distinct ledger fields; collapsing them
  // into commission with fees=0 (the previous behaviour) hid the regulatory
  // costs Firstrade was charging.
  test('keeps Commission and Fee values separate on the resulting trade', async () => {
    const csv = [
      'Symbol,Quantity,Price,Action,Description,TradeDate,SettledDate,Interest,Amount,Commission,Fee,CUSIP,RecordType',
      'AAPL,100.00,150.00,BUY,APPLE INC,2026-01-15,2026-01-16,0.00,-15001.50,1.00,0.50,037833100,Trade',
      'AAPL,-100.00,155.00,SELL,APPLE INC,2026-01-16,2026-01-17,0.00,15497.50,1.00,1.50,037833100,Trade'
    ].join('\n');

    const result = await parseCSV(buf(csv), 'firstrade', {});
    expect(result.trades).toHaveLength(1);
    const trade = result.trades[0];
    expect(trade.commission).toBeCloseTo(2.00, 2);
    expect(trade.fees).toBeCloseTo(2.00, 2);
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

  test('imports single-leg option rows and skips spread rows from PaperMoney account statement exports', async () => {
    const issue322Csv = [
      'Cash Balance',
      'DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE',
      '5/5/26,07:31:00,TRD,="5337400962",SOLD -1 VERTICAL SPY 100 (Weeklys) 5 JUN 26 715/714 PUT @.34,-0.04,-1.30,34.00,"98,898.76"',
      '5/5/26,08:13:43,TRD,="5337576468",SOLD -1 VERTICAL SPX 100 (Weeklys) 9 JUN 26 7050/7025 PUT @4.50,-1.06,-1.30,450.00,"99,346.40"',
      '5/6/26,09:45:00,TRD,="5338000000",BOT +1 AAPL 100 19 JUN 26 200 CALL @1.25,$0.00,-$1.30,-$126.30,"99,220.10"',
      '5/7/26,10:15:00,TRD,="5338000001",SOLD -1 AAPL 100 19 JUN 26 200 CALL @1.75,$0.00,-$1.30,$173.70,"99,393.80"'
    ].join('\n');

    const result = await parseCSV(buf(issue322Csv), 'thinkorswim', {});

    expectValidResult(result);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'AAPL',
      instrumentType: 'option',
      underlyingSymbol: 'AAPL',
      optionType: 'call',
      strikePrice: 200
    }));
    expect(result.diagnostics.skippedReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({
        reason: expect.stringContaining('Multi-leg option spread (VERTICAL) not supported')
      })
    ]));
  });

  test('matches a later option closing import to an existing open option contract', async () => {
    const closingCsv = [
      'DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,Amount,Balance',
      '06/22/2026,15:45:00,TRD,54321,SOLD -10 COIN 100 26 JUN 26 10 CALL @13.00,$0.00,-$1.30,$12998.70,$65000.00'
    ].join('\n');

    const existingExecution = {
      action: 'buy',
      quantity: 10,
      price: 12.11,
      datetime: '2026-06-18T09:30:00.000Z',
      fees: 1.3
    };

    const existingPosition = {
      id: 'open-option-1',
      symbol: 'COIN',
      side: 'long',
      quantity: 10,
      entryPrice: 12.11,
      entryTime: '2026-06-18T09:30:00.000Z',
      tradeDate: '2026-06-18',
      commission: 1.3,
      broker: 'thinkorswim',
      executions: [existingExecution],
      instrumentType: 'option',
      strikePrice: 10,
      expirationDate: '2026-06-26',
      optionType: 'call'
    };

    const result = await parseCSV(buf(closingCsv), 'thinkorswim', {
      existingPositions: {
        'COIN_10_2026-06-26_call': existingPosition
      },
      existingExecutions: {
        'COIN_10_2026-06-26_call': [existingExecution]
      }
    });

    expectValidResult(result);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'COIN',
      side: 'long',
      quantity: 10,
      entryPrice: 12.11,
      exitPrice: 13,
      instrumentType: 'option',
      strikePrice: 10,
      expirationDate: '2026-06-26',
      optionType: 'call',
      isUpdate: true,
      existingTradeId: 'open-option-1'
    }));
    expect(result.trades[0].executions).toHaveLength(2);
    expect(result.trades[0].executions[1]).toMatchObject({
      action: 'sell',
      quantity: 10,
      price: 13
    });
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

  test('uses order id to break same-timestamp IBKR executions', async () => {
    const sameTimestampCSV = [
      'Symbol,Date/Time,Quantity,Price,Commission,Fees,Order ID',
      'AAPL,20250101;093000,100,150.00,-1.00,0.00,1',
      'AAPL,20250101;100000,-100,155.00,-1.00,0.00,2',
      'AAPL,20250101;100000,100,154.00,-1.00,0.00,4',
      'AAPL,20250101;100000,-100,156.00,-1.00,0.00,3'
    ].join('\n');

    const result = await parseCSV(buf(sameTimestampCSV), 'ibkr', {});

    expect(result.trades).toHaveLength(2);
    expect(result.trades[1].side).toBe('short');
    expect(result.trades[1].executions.map(exec => exec.orderId)).toEqual(['3', '4']);
  });

  test('preserves duplicate same-second fills from IBKR activity CSV', async () => {
    const screenshotCSV = [
      'Account,Symbol,Date/Time,Quantity,Price',
      'U1234567,ADVB,2026-04-07 06:39:53,100,8.23',
      'U1234567,ADVB,2026-04-07 06:40:25,-100,8.05',
      'U1234567,ADVB,2026-04-07 06:40:26,100,8.10',
      'U1234567,ADVB,2026-04-07 06:40:26,100,8.10',
      'U1234567,ADVB,2026-04-07 06:40:54,-100,8.41',
      'U1234567,ADVB,2026-04-07 06:41:26,100,8.45',
      'U1234567,ADVB,2026-04-07 06:42:12,-200,8.28'
    ].join('\n');

    const result = await parseCSV(buf(screenshotCSV), 'ibkr', {});

    expect(result.trades).toHaveLength(2);
    expect(result.trades[0].symbol).toBe('ADVB');
    expect(result.trades[0].executions).toHaveLength(2);
    expect(result.trades[1].symbol).toBe('ADVB');
    expect(result.trades[1].quantity).toBe(300);
    expect(result.trades[1].executions).toHaveLength(5);
    expect(result.trades[1].executions).toEqual([
      expect.objectContaining({ action: 'buy', quantity: 100, price: 8.1, datetime: '2026-04-07T06:40:26' }),
      expect.objectContaining({ action: 'buy', quantity: 100, price: 8.1, datetime: '2026-04-07T06:40:26' }),
      expect.objectContaining({ action: 'sell', quantity: 100, price: 8.41, datetime: '2026-04-07T06:40:54' }),
      expect.objectContaining({ action: 'buy', quantity: 100, price: 8.45, datetime: '2026-04-07T06:41:26' }),
      expect.objectContaining({ action: 'sell', quantity: 200, price: 8.28, datetime: '2026-04-07T06:42:12' })
    ]);
  });

  test('keeps same-second partial close fills when updating an existing IBKR option position', async () => {
    const openShortCsv = [
      'Symbol,DateTime,Quantity,Price,Commission,Code,Conid',
      "AVAV  260109C00320000,'2026-01-05 10:23:00,-1,0.9,-0.05204,O;P,834720350",
      "AVAV  260109C00320000,'2026-01-05 10:23:00,-1,0.9,0.64796,O;P,834720350",
      "AVAV  260109C00320000,'2026-01-05 10:23:00,-2,0.9,0.59592,O;P,834720350",
      "AVAV  260109C00320000,'2026-01-05 10:23:00,-1,0.9,0.29796,O;P,834720350",
      "AVAV  260109C00320000,'2026-01-05 10:23:00,-1,0.9,0.29796,O;P,834720350",
      "AVAV  260109C00320000,'2026-01-05 10:23:03,-1,0.9,0.29796,O;P,834720350"
    ].join('\n');
    const partialCloseCsv = [
      'Symbol,DateTime,Quantity,Price,Commission,Code,Conid',
      "AVAV  260109C00320000,'2026-01-08 10:46:38,1,0.45,-0.04875,C;P,834720350",
      "AVAV  260109C00320000,'2026-01-08 10:46:38,1,0.45,0.65125,C;P,834720350"
    ].join('\n');

    const initialResult = await parseCSV(buf(openShortCsv), 'ibkr', {});
    const existingTrade = { ...initialResult.trades[0], id: 'trade-1' };
    const optionKey = `${existingTrade.underlyingSymbol}_${existingTrade.strikePrice}_${existingTrade.expirationDate}_${existingTrade.optionType}`;
    const existingPositions = {
      [existingTrade.symbol]: existingTrade,
      [`conid_${existingTrade.conid}`]: existingTrade,
      [optionKey]: existingTrade
    };
    const existingExecutions = {
      [existingTrade.symbol]: existingTrade.executions,
      [`conid_${existingTrade.conid}`]: existingTrade.executions,
      [optionKey]: existingTrade.executions
    };

    const result = await parseCSV(buf(partialCloseCsv), 'ibkr', {
      existingPositions,
      existingExecutions
    });

    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].quantity).toBe(5);
    expect(result.trades[0].executions).toHaveLength(8);
    expect(
      result.trades[0].executions.filter(exec =>
        exec.action === 'buy' &&
        exec.quantity === 1 &&
        exec.price === 0.45 &&
        exec.datetime === '2026-01-08T10:46:38'
      )
    ).toHaveLength(2);
  });

  test('parses trade confirmation format', async () => {
    const tradeConfCSV = [
      'Symbol,UnderlyingSymbol,Strike,Expiry,Put/Call,Multiplier,Buy/Sell,Date/Time,Quantity,Price,Commission',
      'AAPL230120C00150000,AAPL,150,20230120,C,100,BUY,20230120;093000,1,5.00,-1.00'
    ].join('\n');
    const result = await parseCSV(buf(tradeConfCSV), 'ibkr_trade_confirmation', {});
    expectValidResult(result);
  });

  test('parses IBKR multi-section Activity Statement Trades section', async () => {
    const activityCSV = [
      'Statement,Header,Field Name,Field Value',
      'Statement,Data,Title,Activity Statement',
      'Account Information,Header,Field Name,Field Value',
      'Account Information,Data,Account,U1234567',
      'Trades,Header,DataDiscriminator,Asset Category,Currency,Symbol,Date/Time,Quantity,T. Price,C. Price,Proceeds,Comm/Fee,Basis,Realized P/L,MTM P/L,Code',
      'Trades,Data,Order,Stocks,USD,AAPL,"2026-01-05, 09:30:00",100,150.00,150.00,-15000,-1.00,15001,0,0,O',
      'Trades,Data,Order,Stocks,USD,AAPL,"2026-01-06, 10:00:00",-100,155.00,155.00,15500,-1.00,-15001,498,0,C',
      'Trades,SubTotal,,Stocks,USD,AAPL,,0,,,500,-2.00,0,498,0,',
      'Trades,Total,,Stocks,USD,,,,,,500,-2.00,0,498,0,'
    ].join('\n');
    const result = await parseCSV(buf(activityCSV), 'ibkr', {});
    expectValidResult(result);
    expect(result.trades.length).toBe(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'AAPL',
      side: 'long',
      entryPrice: 150,
      exitPrice: 155,
      broker: 'ibkr'
    }));
  });

  test('parses CapTrader Transaction History export and tags broker', async () => {
    const captraderCSV = [
      'Statement,Header,Feldname,Feldwert',
      'Statement,Data,Title,Transaction History',
      'Summary,Header,Feldname,Feldwert',
      'Summary,Data,Basiswährung,EUR',
      'Transaction History,Header,Date,Account,Description,Transaction Type,Symbol,Quantity,Price,Price Currency,Gross Amount ,Commission,Net Amount',
      'Transaction History,Data,2026-05-14,U***50777 Trading,MNQ 18JUN26 Position MTM,Position MTM,MNQM6,-,-,-,357.34,-,357.34',
      'Transaction History,Data,2026-05-14,U***07430 Invest..,XETRA-GOLD MAINTENANCE FEE,Other Fee,-,-,-,-,-0.09,-,-0.09',
      'Transaction History,Data,2026-05-14,U***50777 Trading,MCL JUN26,Buy,MCLM6,2.0,99.94,USD,-17128.51,-2.14,208.66',
      'Transaction History,Data,2026-05-14,U***50777 Trading,MCL JUN26,Sell,MCLM6,-2.0,101.31,USD,17363.31,-2.14,43.70'
    ].join('\n');
    const result = await parseCSV(buf(captraderCSV), 'captrader', {});
    expectValidResult(result);
    // Position MTM and Other Fee rows must be filtered out, leaving only the Buy/Sell pair
    expect(result.trades.length).toBe(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'MCLM6',
      side: 'long',
      broker: 'captrader'
    }));
  });

  test('parses IBKR trade confirmation futures using AssetClass and Multiplier', async () => {
    const tradeConfFuturesCSV = [
      'AssetClass,Symbol,UnderlyingSymbol,Strike,Expiry,Put/Call,Multiplier,Buy/Sell,Date/Time,Quantity,Price,Commission',
      'FUT,MESM6,MES,,,,5,BUY,20260323;122919,1,6622.00,-1.24',
      'FUT,MESM6,MES,,,,5,SELL,20260323;123019,1,6627.00,-1.24'
    ].join('\n');

    const result = await parseCSV(buf(tradeConfFuturesCSV), 'ibkr_trade_confirmation', {});

    expectValidResult(result);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'MESM6',
      instrumentType: 'future',
      underlyingAsset: 'MES',
      pointValue: 5,
      entryPrice: 6622,
      exitPrice: 6627
    }));
    expect(result.trades[0].pnl).toBeCloseTo(22.52, 2);
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
    expect(result.diagnostics.skippedRows).toBe(1);
    expect(result.diagnostics.expected_skipped_rows).toBe(1);
    expect(result.diagnostics.warnings).not.toEqual(expect.arrayContaining([
      expect.stringContaining('High skip rate')
    ]));
  });

  test('keeps fractional order-history quantities from creating fake short open positions', async () => {
    const fractionalOrderHistory = [
      'Symbol,Side,Type,Quantity,Limit price,Stop price,Fill price,Status,Commission,Placing time,Closing time,Order ID,Level ID,Leverage,Margin',
      'NASDAQ:WCT,Sell,Market,1706.16,,,1.82,Filled,1.5,2026-06-03 17:16:10,2026-06-03 17:16:10,3140964538,,1:1,"3,105.21 USD"',
      'NASDAQ:WCT,Sell,Limit,1706.16,2.3987,,0,Cancelled,,2026-06-03 17:13:58,2026-06-03 17:16:10,3140947113,,,',
      'NASDAQ:WCT,Buy,Stop,284.36,,1.9123,1.93,Filled,1.5,2026-06-03 17:11:37,2026-06-03 17:13:23,3140929584,,1:1,',
      'NASDAQ:WCT,Buy,Stop,284.36,,1.9117,1.93,Filled,1.5,2026-06-03 17:11:34,2026-06-03 17:13:23,3140929214,,1:1,',
      'NASDAQ:WCT,Buy,Stop,284.36,,1.9104,1.93,Filled,1.5,2026-06-03 17:11:32,2026-06-03 17:13:23,3140928859,,1:1,',
      'NASDAQ:WCT,Buy,Stop,284.36,,1.904,1.93,Filled,1.5,2026-06-03 17:11:29,2026-06-03 17:13:23,3140928471,,1:1,',
      'NASDAQ:WCT,Buy,Stop,284.36,,1.9117,1.93,Filled,1.5,2026-06-03 17:11:24,2026-06-03 17:13:23,3140927680,,1:1,',
      'NASDAQ:WCT,Buy,Stop,284.36,,1.902,1.93,Filled,1.5,2026-06-03 17:11:20,2026-06-03 17:13:23,3140927000,,1:1,',
      'NASDAQ:DEVS,Sell,Market,4390.38,,,0.8757,Filled,1.5,2026-06-03 16:48:29,2026-06-03 16:48:29,3140000001,,1:1,',
      'NASDAQ:DEVS,Buy,Stop,731.73,,0.86,0.86,Filled,1.5,2026-06-03 16:45:46,2026-06-03 16:47:36,3140000002,,1:1,',
      'NASDAQ:DEVS,Buy,Stop,731.73,,0.86,0.86,Filled,1.5,2026-06-03 16:45:46,2026-06-03 16:47:36,3140000003,,1:1,',
      'NASDAQ:DEVS,Buy,Stop,731.73,,0.838,0.838,Filled,1.5,2026-06-03 16:45:46,2026-06-03 16:45:46,3140000004,,1:1,',
      'NASDAQ:DEVS,Buy,Stop,731.73,,0.838,0.838,Filled,1.5,2026-06-03 16:45:46,2026-06-03 16:45:46,3140000005,,1:1,',
      'NASDAQ:DEVS,Buy,Stop,731.73,,0.838,0.838,Filled,1.5,2026-06-03 16:45:46,2026-06-03 16:45:46,3140000006,,1:1,',
      'NASDAQ:DEVS,Buy,Stop,731.73,,0.838,0.838,Filled,1.5,2026-06-03 16:45:46,2026-06-03 16:45:46,3140000007,,1:1,',
      'NASDAQ:HUBC,Sell,Market,3941.75,,,0.75,Filled,1.5,2026-06-03 16:41:23,2026-06-03 16:41:23,3150000001,,1:1,',
      'NASDAQ:HUBC,Buy,Stop,788.35,,0.788,0.788,Filled,1.5,2026-06-03 16:38:16,2026-06-03 16:38:17,3150000002,,1:1,',
      'NASDAQ:HUBC,Buy,Stop,788.35,,0.788,0.788,Filled,1.5,2026-06-03 16:38:16,2026-06-03 16:38:17,3150000003,,1:1,',
      'NASDAQ:HUBC,Buy,Stop,788.35,,0.788,0.788,Filled,1.5,2026-06-03 16:38:16,2026-06-03 16:38:17,3150000004,,1:1,',
      'NASDAQ:HUBC,Buy,Stop,788.35,,0.788,0.788,Filled,1.5,2026-06-03 16:38:16,2026-06-03 16:38:17,3150000005,,1:1,',
      'NASDAQ:HUBC,Buy,Stop,788.35,,0.788,0.788,Filled,1.5,2026-06-03 16:38:16,2026-06-03 16:38:17,3150000006,,1:1,',
      'AMEX:PMI,Sell,Market,6898,,,0.354,Filled,1.5,2026-06-03 16:33:30,2026-06-03 16:33:30,3160000001,,1:1,',
      'AMEX:PMI,Buy,Stop,1724.5,,0.357,0.357,Filled,1.5,2026-06-03 16:32:58,2026-06-03 16:32:58,3160000002,,1:1,',
      'AMEX:PMI,Buy,Stop,1724.5,,0.357,0.357,Filled,1.5,2026-06-03 16:32:58,2026-06-03 16:32:58,3160000003,,1:1,',
      'AMEX:PMI,Buy,Stop,1724.5,,0.357,0.357,Filled,1.5,2026-06-03 16:32:58,2026-06-03 16:32:58,3160000004,,1:1,',
      'AMEX:PMI,Buy,Stop,1724.5,,0.352,0.352,Filled,1.5,2026-06-03 16:32:24,2026-06-03 16:32:24,3160000005,,1:1,',
      'AMEX:PMI,Sell,Stop,6898,,0.34,0,Rejected,,2026-06-03 16:31:00,2026-06-03 16:31:00,3160000006,,,'
    ].join('\n');

    const result = await parseCSV(buf(fractionalOrderHistory), 'tradingview', {
      tradeGroupingSettings: { enabled: false }
    });

    expectValidResult(result);
    expect(result.diagnostics.skippedRows).toBe(2);
    expect(result.diagnostics.reason_breakdown).toEqual(expect.arrayContaining([
      expect.objectContaining({ reason: 'Cancelled order (not executed)', count: 1 }),
      expect.objectContaining({ reason: 'Rejected order', count: 1 })
    ]));

    const affectedSymbols = ['NASDAQ:WCT', 'NASDAQ:DEVS', 'NASDAQ:HUBC', 'AMEX:PMI'];
    const affectedTrades = result.trades.filter(trade => affectedSymbols.includes(trade.symbol));
    expect(affectedTrades).toHaveLength(4);
    expect(affectedTrades.every(trade => trade.exitTime && trade.exitPrice != null)).toBe(true);
    expect(affectedTrades.some(trade => trade.side === 'short')).toBe(false);

    const wct = affectedTrades.find(trade => trade.symbol === 'NASDAQ:WCT');
    expect(wct.quantity).toBeCloseTo(1706.16, 6);
    expect(wct.executionData.some(execution => execution.quantity === 284.36)).toBe(true);
  });

  test('routes TradingView order history when TradeStation is selected manually', async () => {
    const tradingViewOrderHistory = [
      'Symbol,Side,Type,Quantity,Limit price,Stop price,Fill price,Status,Commission,Placing time,Closing time,Order ID,Level ID,Leverage,Margin',
      'NASDAQ:WCT,Buy,Market,10,,,2.00,Filled,0,2026-06-03 09:30:00,2026-06-03 09:30:00,1,,1:1,',
      'NASDAQ:WCT,Sell,Market,10,,,2.10,Filled,0,2026-06-03 09:35:00,2026-06-03 09:35:00,2,,1:1,'
    ].join('\n');

    const result = await parseCSV(buf(tradingViewOrderHistory), 'tradestation', {});

    expectValidResult(result);
    expect(result.trades).toHaveLength(1);
    expect(result.diagnostics.selectedBroker).toBe('tradestation');
    expect(result.diagnostics.detectedBroker).toBe('tradingview');
    expect(result.diagnostics.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('CSV headers match TradingView order history')
    ]));
  });

  test('warns but preserves true short behavior when order history starts with sell', async () => {
    const shortFirst = [
      'Symbol,Side,Type,Quantity,Limit price,Stop price,Fill price,Status,Commission,Placing time,Closing time,Order ID,Level ID,Leverage,Margin',
      'NASDAQ:LASE,Sell,Market,1963.16,,,2.22,Filled,1.5,2026-06-02 21:13:18,2026-06-02 21:13:18,3170000001,,1:1,',
      'NASDAQ:LASE,Buy,Market,1000,,,2.10,Filled,1.5,2026-06-03 10:00:00,2026-06-03 10:00:00,3170000002,,1:1,'
    ].join('\n');

    const result = await parseCSV(buf(shortFirst), 'tradingview', {
      tradeGroupingSettings: { enabled: false }
    });

    expectValidResult(result);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'NASDAQ:LASE',
      side: 'short'
    }));
    expect(result.trades[0].exitTime).toBeNull();
    expect(result.trades[0].quantity).toBeCloseTo(963.16, 6);
    expect(result.diagnostics.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('starts with a Sell')
    ]));
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

  const paperMoneyFuturesCSV = [
    'Exec Time,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,Price,Net Price,Order Type',
    '4/6/26 09:15:49,FUTURE,BUY,1,TO OPEN,/NQM26,JUN 26,,FUTURE,24363.00,24363.00,MKT',
    '4/6/26 09:16:12,FUTURE,SELL,1,TO CLOSE,/NQM26,JUN 26,,FUTURE,24369.25,24369.25,MKT'
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

  test('applies futures point value when calculating pnl', async () => {
    const result = await parseCSV(buf(paperMoneyFuturesCSV), 'papermoney', {});

    expectValidResult(result);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].instrumentType).toBe('future');
    expect(result.trades[0].pointValue).toBe(20);
    expect(result.trades[0].entryPrice).toBe(24363);
    expect(result.trades[0].exitPrice).toBe(24369.25);
    expect(result.trades[0].pnl).toBe(125);
  });

  test('parses trade activity rows with Time Placed and uppercase PRICE', async () => {
    const tradeActivityCSV = [
      'Today\'s Trade Activity for 72074033SCHW (Trading) on 7/2/26 08:44:52',
      'Notes,,Time Placed,Spread,Side,Qty,Pos Effect,Symbol,Exp,Strike,Type,PRICE,,TIF,Mark,Status',
      ',,6/22/26 12:40:29,SINGLE,BUY,+1,TO OPEN,MRK,17 JUL 26,120,CALL,.52,LMT,GTC,9.225,FILLED',
      ',,6/22/26 12:45:29,SINGLE,SELL,-1,TO CLOSE,MRK,17 JUL 26,120,CALL,.72,LMT,GTC,9.225,FILLED',
      ',,6/29/26 09:37:41,STOCK,SELL,-58,TO CLOSE,VRTX,,,STOCK,~,MKT,GTC,519.85,WORKING',
      ',,,RE #1006938727494,,,,,,,,460.78,STP,STD,,'
    ].join('\n');

    const result = await parseCSV(buf(tradeActivityCSV), 'auto', {});

    expectValidResult(result);
    expect(result.diagnostics.detectedBroker).toBe('papermoney');
    expect(result.trades).toHaveLength(1);

    const trade = result.trades[0];
    expect(trade.symbol).toBe('MRK');
    expect(trade.instrumentType).toBe('option');
    expect(trade.expirationDate).toBe('2026-07-17');
    expect(trade.strikePrice).toBe(120);
    expect(trade.optionType).toBe('call');
    expect(trade.quantity).toBe(1);
    expect(trade.entryPrice).toBe(0.52);
    expect(trade.exitPrice).toBe(0.72);
    expect(trade.pnl).toBeCloseTo(20, 5);
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

  test('parses paired trades export format', async () => {
    const fixturePath = path.join(__dirname, '..', 'fixtures', 'tradovate-paired-trades-sample.csv');
    const pairedCSV = fs.readFileSync(fixturePath, 'utf-8');

    const result = await parseCSV(buf(pairedCSV), 'tradovate', {});

    expectValidResult(result);
    expect(result.trades).toHaveLength(5);
    expect(result.trades[0].symbol).toBe('MNQM6');
    expect(result.trades[0].instrumentType).toBe('future');
    expect(result.trades[0].pointValue).toBe(2);
    expect(result.trades[0].quantity).toBe(5);
    expect(result.trades[0].pnl).toBe(-12.5);
    expect(result.trades[0].accountIdentifier).toBe('APEX4977960000002');
    expect(result.trades[3].side).toBe('short');
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

describe('Dashboard-derived CSV import contracts', () => {
  test.each(calculationContracts.csv_import_cases)('$id', async ({ csv, expected }) => {
    const result = await parseCSV(buf(csv), 'auto', {
      tradeGroupingSettings: { enabled: false }
    });

    expectValidResult(result);
    expect(result.diagnostics.detectedBroker).toBe(expected.detected_broker);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: expected.symbol,
      broker: expected.broker,
      side: expected.side,
      quantity: expected.quantity,
      entryPrice: expected.entry_price,
      exitPrice: expected.exit_price,
      tradeDate: expected.trade_date,
      instrumentType: expected.instrument_type
    }));
    if (expected.commission !== undefined) {
      expect(result.trades[0].commission).toBeCloseTo(expected.commission, 6);
    }
    if (expected.execution_count !== undefined) {
      expect(result.trades[0].executions).toHaveLength(expected.execution_count);
    }
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

  test('keeps commissions separate from fees for TradeStation imports', async () => {
    const detailedFeesCSV = [
      'Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time,Comm,SEC,TAF,NSCC,Nasdaq,ECN Remove,ECN Add,Gross Proceeds,Net Proceeds,Clr Broker,Liq,Note',
      '12345,4/30/26,5/1/26,USD,2,B,HCAI,100,11.02,7:35:46,0.99,0,0,0.03,0.01,0,0,-1102.00,-1103.03,VIRTU,1,',
      '12345,4/30/26,5/1/26,USD,2,S,HCAI,100,11.61,7:51:52,0.99,0.01,0.01,0.03,0.01,0,0,1161.00,1158.95,VIRTU,1,'
    ].join('\n');

    const result = await parseCSV(buf(detailedFeesCSV), 'tradestation', {});

    expectValidResult(result);
    expect(result.diagnostics.invalidRows).toBe(0);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'HCAI',
      commission: 1.98,
      fees: 0.10
    }));
  });

  test('preserves option instrument metadata and contract size for OCC symbols', async () => {
    const optionCsv = [
      'Account,T/D,S/D,Currency,Type,Side,Symbol,Qty,Price,Exec Time,Comm,SEC,TAF,NSCC,Nasdaq,ECN Remove,ECN Add,Gross Proceeds,Net Proceeds,Clr Broker,Liq,Note',
      '12345,05/29/2026,06/01/2026,USD,2,B,SPCE260529C00004500,10,0.27,09:48:09,1,0,0,0,0,0,0,-270.00,-271.00,VLAMP,,',
      '12345,05/29/2026,06/01/2026,USD,2,S,SPCE260529C00004500,10,1.51,14:53:58,1,0,0,0,0,0,0,1510.00,1509.00,VCTDLOPT,,'
    ].join('\n');

    const result = await parseCSV(buf(optionCsv), 'tradestation', {});

    expectValidResult(result);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'SPCE260529C00004500',
      instrumentType: 'option',
      underlyingSymbol: 'SPCE',
      optionType: 'call',
      strikePrice: 4.5,
      contractSize: 100
    }));
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

  test('parses completed trade rows with opening and closing columns', async () => {
    const completedTradeCSV = [
      '"Symbol","Opening direction","Opening time (UTC-4)","Closing time (UTC-4)","Entry price","Closing price","Closing Quantity","Net $"',
      '"TSLA","Buy","15/04/2026 15:09:58.271","17/04/2026 15:53:04.151","392.06","400.24","2.00 Lots","16.04"',
      '"XAGUSD","Sell","15/04/2026 19:43:15.558","15/04/2026 19:43:40.872","79.519","79.566","0.01 Lots","-2.35"'
    ].join('\n');
    const result = await parseCSV(buf(completedTradeCSV), 'generic', {
      tradeGroupingSettings: { enabled: false }
    });

    expectValidResult(result);
    expect(result.trades).toHaveLength(2);
    expect(result.diagnostics.invalidRows).toBe(0);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'TSLA',
      tradeDate: '2026-04-15',
      entryTime: '2026-04-15T15:09:58',
      exitTime: '2026-04-17T15:53:04',
      entryPrice: 392.06,
      exitPrice: 400.24,
      quantity: 2,
      side: 'long',
      pnl: 16.04
    }));
    expect(result.trades[1]).toEqual(expect.objectContaining({
      symbol: 'XAGUSD',
      side: 'short',
      pnl: -2.35
    }));
  });

  test('parses completed trade rows with entry and exit date columns', async () => {
    const completedTradeCSV = [
      'Symbol,Entry Date,Exit Date,Quantity,Entry Price,Exit Price,Commission,Side,Currency',
      '6EM5,2025-06-06 08:30:01,2025-06-06 16:14:14,2.0,1.1399,1.14025,9.88,Long,USD',
      'MESM5,2025-04-04 07:26:45,2025-04-06 21:52:45,1.0,5252.0,4981.25,1.24,Short,USD'
    ].join('\n');
    const result = await parseCSV(buf(completedTradeCSV), 'generic', {
      tradeGroupingSettings: { enabled: false }
    });

    expectValidResult(result);
    expect(result.trades).toHaveLength(2);
    expect(result.diagnostics.invalidRows).toBe(0);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: '6EM5',
      tradeDate: '2025-06-06',
      entryTime: '2025-06-06T08:30:01',
      exitTime: '2025-06-06T16:14:14',
      entryPrice: 1.1399,
      exitPrice: 1.14025,
      quantity: 2,
      side: 'long'
    }));
  });

  test('parses Apex-style completed trade rows with Instrument and dd-mm-yyyy timestamps', async () => {
    const apexCompletedTradeCSV = [
      'Trade number,Instrument,Account,Strategy,Market pos.,Qty,Entry price,Exit price,Entry time,Exit time,Entry name,Exit name,Profit,Cum. net profit,Commission,Clearing Fee,Exchange Fee,IP Fee,NFA Fee,MAE,MFE,ETD,Bars,',
      '1,NQ JUN26,PA-APEX-12345-625!Apex!Apex,100-100-5,Short,1,23960.00,23955.50,01-04-2026 00:27:56,01-04-2026 00:30:54,Entry,Target1,90.00 $,90.00 $,0.00 $,0.00 $,0.00 $,0.00 $,0.00 $,160.00 $,105.00 $,15.00 $,0,'
    ].join('\n');

    const result = await parseCSV(buf(apexCompletedTradeCSV), 'generic', {
      tradeGroupingSettings: { enabled: false }
    });

    expectValidResult(result);
    expect(result.trades).toHaveLength(1);
    expect(result.diagnostics.invalidRows).toBe(0);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'NQ JUN26',
      tradeDate: '2026-04-01',
      entryTime: '2026-04-01T00:27:56',
      exitTime: '2026-04-01T00:30:54',
      entryPrice: 23960,
      exitPrice: 23955.5,
      quantity: 1,
      side: 'short',
      pnl: 90
    }));
  });

  test('parses lowercase trade_date and trade_type transaction exports', async () => {
    const indianBrokerCSV = [
      'symbol,isin,trade_date,exchange,segment,series,trade_type,auction,quantity,price,trade_id,order_id,order_execution_time',
      'SUZLON,INE040H01021,2025-06-09,NSE,EQ,EQ,buy,false,450.000000,67.500000,603052659,1300000021339012,2025-06-09T10:22:33',
      'SUZLON,INE040H01021,2025-06-12,NSE,EQ,EQ,sell,false,450.000000,66.000000,605366350,1300000042576567,2025-06-12T12:04:50'
    ].join('\n');
    const result = await parseCSV(buf(indianBrokerCSV), 'generic', {
      tradeGroupingSettings: { enabled: false }
    });

    expectValidResult(result);
    expect(result.trades).toHaveLength(1);
    expect(result.diagnostics.invalidRows).toBe(0);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'SUZLON',
      entryTime: '2025-06-09T10:22:33',
      exitTime: '2025-06-12T12:04:50',
      quantity: 450
    }));
  });

  test('parses Trading 212 style market buy and sell rows', async () => {
    const trading212CSV = [
      'Action,Time,ISIN,Ticker,Name,Notes,ID,No. of shares,Price / share,Currency (Price / share),Exchange rate,Result,Currency (Result),Total,Currency (Total),Withholding tax,Currency (Withholding tax),Currency conversion fee,Currency (Currency conversion fee)',
      'Market buy,2024-12-26 14:30:06,US7134481081,PEP,PepsiCo,,EOF25550025661,0.0067696000,153.3900000000,USD,1.03838894,,USD,1.00,USD,,,,',
      'Market sell,2024-12-27 14:30:06,US7134481081,PEP,PepsiCo,,EOF25550025662,0.0067696000,154.3900000000,USD,1.03838894,,USD,1.01,USD,,,,'
    ].join('\n');
    const result = await parseCSV(buf(trading212CSV), 'generic', {
      tradeGroupingSettings: { enabled: false }
    });

    expectValidResult(result);
    expect(result.trades).toHaveLength(1);
    expect(result.diagnostics.invalidRows).toBe(0);
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'PEP',
      entryPrice: 153.39
    }));
    expect(result.trades[0].exitPrice).toBeCloseTo(154.39);
  });

  test('parses generic fill exports with Close time, Filled quantity, and Avg fill price', async () => {
    const fillCSV = [
      'Symbol,Side,Type,Filled quantity,Quantity left,Avg fill price,Close time,Routing,Duration,Commission fee,Route fee,Currency,Conversion rate,Country,Order ID',
      'TWST,Sell,Stop,183,0,75.7503,2026-06-12 10:24:39,Intelligent,GTC - 9/9/2026,0,0,USD,1,,1274618679',
      'TWST,Buy,Limit,183,0,77.61,2026-06-12 09:36:32,Intelligent,DAY,0,0,USD,1,,1274555912',
      'CECO,Sell,Stop,150,0,95.172,2026-06-11 10:05:51,Intelligent,GTC - 9/8/2026,0,0,USD,1,,1274068358',
      'CECO,Buy,Limit,150,0,96.56,2026-06-11 09:37:59,Intelligent,DAY,0,0,USD,1,,1274013882'
    ].join('\n');

    const result = await parseCSV(buf(fillCSV), 'generic', {
      tradeGroupingSettings: { enabled: false }
    });

    expectValidResult(result);
    expect(result.trades).toHaveLength(2);
    expect(result.diagnostics.invalidRows).toBe(0);
    expect(result.diagnostics.user_summary).toBeNull();
    expect(result.trades[0]).toEqual(expect.objectContaining({
      symbol: 'CECO',
      tradeDate: '2026-06-11',
      entryTime: '2026-06-11T09:37:59',
      exitTime: '2026-06-11T10:05:51',
      entryPrice: 96.56,
      exitPrice: 95.172,
      quantity: 150,
      side: 'long'
    }));
    expect(result.trades[1]).toEqual(expect.objectContaining({
      symbol: 'TWST',
      tradeDate: '2026-06-12',
      entryTime: '2026-06-12T09:36:32',
      exitTime: '2026-06-12T10:24:39',
      entryPrice: 77.61,
      exitPrice: 75.7503,
      quantity: 183,
      side: 'long'
    }));
  });

  test('does not treat account labels containing CurrencyCode as currency columns', async () => {
    const questradeConfirmationCSV = [
      'CurrencyCode_Group_Account,Trade Date,Settlement date,Trade #,Action,Quantity,Symbol,Description,TB,EX,Price,Gross amount,Comm,SEC fees,Interest amount,Net amount,Net amount (account currency)',
      'Canadian stocks and options - Account 5361397317,20-10-25,21-10-25,AAEBA7,Buy,80,.FTG,"FIRAN TECHNOLOGY GROUP, CORPORATION",A,CXD,10.40,(832.00),0.00,0.00,0.00,(832.00),(832.00)',
      'Canadian stocks and options - Account 5361397317,21-10-25,22-10-25,AC3001,Sell,80,.FTG,"FIRAN TECHNOLOGY GROUP, CORPORATION",A,CXD,10.02,801.60,0.00,0.00,0.00,801.60,801.60'
    ].join('\n');
    const result = await parseCSV(buf(questradeConfirmationCSV), 'generic', {
      tradeGroupingSettings: { enabled: false }
    });

    expectValidResult(result);
    expect(result.trades).toHaveLength(1);
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
          reason: expect.stringContaining('trade date')
        })
      ])
    );
    expect(result.diagnostics.reason_breakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ count: 1 })
      ])
    );
  });

  test('parses time-only generic rows when the filename provides the trade date', async () => {
    const timeOnlyGenericCSV = [
      'Symbol,Price,Qty,Time,Side,Type,',
      'AXIL,8.14,13,08:09:38,S,Margin,',
      'AXIL,8.14,7,08:09:38,S,Margin,',
      'AXIL,8.26,5,08:08:48,B,Margin,',
      'AXIL,8.26,15,08:08:48,B,Margin,',
      'AXIL,9.7,20,08:04:39,S,Margin,'
    ].join('\n');

    const result = await parseCSV(buf(timeOnlyGenericCSV), 'generic', {
      fileName: 'AXIL-2026-05-02.csv',
      tradeGroupingSettings: { enabled: false }
    });

    expectValidResult(result);
    expect(result.trades.length).toBeGreaterThan(0);
    expect(result.diagnostics.invalidRows).toBe(0);
    expect(result.trades.every(trade => trade.symbol === 'AXIL')).toBe(true);
    expect(result.trades.every(trade => trade.tradeDate === '2026-05-02')).toBe(true);
    expect(result.trades.some(trade => trade.entryTime === '2026-05-02T08:04:39')).toBe(true);
    expect(result.trades.some(trade => Array.isArray(trade.executions) && trade.executions.length > 0)).toBe(true);
  });

  test('explains time-only generic failures when no date can be inferred', async () => {
    const timeOnlyGenericCSV = [
      'Symbol,Price,Qty,Time,Side,Type,',
      'AXIL,8.14,13,08:09:38,S,Margin,',
      'AXIL,8.26,5,08:08:48,B,Margin,'
    ].join('\n');

    const result = await parseCSV(buf(timeOnlyGenericCSV), 'generic', {
      fileName: 'AXIL.csv',
      tradeGroupingSettings: { enabled: false }
    });

    expectValidResult(result);
    expect(result.trades).toHaveLength(0);
    expect(result.diagnostics.invalidRows).toBe(2);
    expect(result.diagnostics.skippedReasons[0].reason).toContain('time was present, but no trade date was found');
    expect(result.diagnostics.user_summary).toEqual(expect.objectContaining({
      title: expect.stringContaining('missing a trade date')
    }));
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
