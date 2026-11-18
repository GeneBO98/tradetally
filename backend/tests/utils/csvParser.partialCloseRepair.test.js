jest.mock('../../src/config/database', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../../src/utils/finnhub', () => ({}));
jest.mock('../../src/utils/cache', () => ({ get: jest.fn().mockReturnValue(null), set: jest.fn(), del: jest.fn(), data: {} }));
jest.mock('../../src/utils/cusipQueue', () => ({ addToQueue: jest.fn() }));
jest.mock('../../src/utils/currencyConverter', () => ({
  convertTradeToUSD: jest.fn(trade => trade),
  userHasProAccess: jest.fn().mockResolvedValue(false)
}));

const { repairTradeReversals } = require('../../src/utils/csv/grouping');
const { wrapResultWithDiagnostics } = require('../../src/utils/csvParser');

function makePartialCloseTrade() {
  return {
    symbol: 'AEHL',
    tradeDate: '2026-05-14',
    entryTime: '2026-05-14T08:46:16',
    entryPrice: 5.7048,
    quantity: 10,
    side: 'long',
    commission: 0,
    fees: 0,
    pnl: 0,
    instrumentType: 'stock',
    broker: 'thinkorswim',
    accountIdentifier: 'SCHW',
    executions: [
      { fees: 0, price: 5.7048, action: 'buy', datetime: '2026-05-14T08:46:16', quantity: 10 },
      { fees: 0, price: 5.8, action: 'sell', datetime: '2026-05-14T08:47:17', quantity: 5 }
    ]
  };
}

function makeDiagnostics() {
  return {
    warnings: [],
    totalRows: 2,
    parsedRows: 1,
    invalidRows: 0,
    skippedRows: 0,
    skippedReasons: []
  };
}

function expectPartialClosePreserved(result) {
  expect(result).toHaveLength(1);
  expect(result[0].quantity).toBe(5);
  expect(result[0].exitPrice).toBeNull();
  expect(result[0].exitTime).toBeNull();
  expect(result[0].pnl).toBeCloseTo(0.476, 8);
  expect(result[0].pnlPercent).toBeCloseTo((0.476 / 57.048) * 100, 8);
  expect(result[0].executions[1].realized_pnl).toBeCloseTo(0.476, 8);
}

describe('CSV inconsistent-trade repair', () => {
  test('modular repair preserves realized P&L for an open partial close', () => {
    const diagnostics = makeDiagnostics();
    const result = repairTradeReversals([makePartialCloseTrade()], diagnostics);

    expectPartialClosePreserved(result);
    expect(diagnostics.warnings).toContain(
      'Repaired inconsistent trade for AEHL into 1 trades (quantity mismatch)'
    );
  });

  test('compatibility parser repair preserves realized P&L for an open partial close', () => {
    const diagnostics = makeDiagnostics();
    const result = wrapResultWithDiagnostics([makePartialCloseTrade()], diagnostics);

    expectPartialClosePreserved(result.trades);
    expect(result.diagnostics.warnings).toContain(
      'Repaired inconsistent trade for AEHL into 1 trades (quantity mismatch)'
    );
  });

  test('a repaired position with no closing fills remains zero P&L', () => {
    const trade = makePartialCloseTrade();
    trade.quantity = 5;
    trade.executions = [trade.executions[0]];

    const result = repairTradeReversals([trade], makeDiagnostics());

    expect(result[0].pnl).toBe(0);
    expect(result[0].pnlPercent).toBe(0);
    expect(result[0].executions[0].realized_pnl).toBeNull();
  });

  test.each(['long', 'short'])('a grouped %s round trip with its own exit stays closed', (side) => {
    const trade = {
      symbol: 'AAPL',
      tradeDate: '2025-01-01',
      entryTime: '2025-01-01T14:30:00Z',
      exitTime: '2025-01-01T15:00:00Z',
      entryPrice: 150,
      exitPrice: 155,
      quantity: 100,
      side,
      pnl: side === 'long' ? 500 : -500,
      executions: [{
        side,
        quantity: 100,
        entryPrice: 150,
        exitPrice: 155,
        entryTime: '2025-01-01T14:30:00Z',
        exitTime: '2025-01-01T15:00:00Z'
      }]
    };
    const diagnostics = makeDiagnostics();

    const [result] = repairTradeReversals([trade], diagnostics);

    expect(result).toMatchObject({ side, entryPrice: 150, exitPrice: 155, pnl: trade.pnl });
    expect(diagnostics.warnings).toHaveLength(0);
  });

  test('a grouped record with a blank exit still counts as open', () => {
    const trade = {
      symbol: 'AAPL',
      tradeDate: '2025-01-01',
      entryTime: '2025-01-01T14:30:00Z',
      entryPrice: 150,
      quantity: 100,
      side: 'long',
      executions: [{ side: 'long', quantity: 100, entryPrice: 150, exitPrice: '', exitTime: '' }]
    };
    const diagnostics = makeDiagnostics();

    const [result] = repairTradeReversals([trade], diagnostics);

    expect(result).toMatchObject({ side: 'long', quantity: 100, entryPrice: 150 });
    expect(diagnostics.warnings).toHaveLength(0);
  });

  test('grouped lots mixing a closed and an open record are left unchanged', () => {
    const trade = {
      symbol: 'AAPL',
      tradeDate: '2025-01-01',
      entryTime: '2025-01-01T14:30:00Z',
      entryPrice: 150.67,
      quantity: 150,
      side: 'long',
      executions: [
        { side: 'long', quantity: 100, entryPrice: 150, exitPrice: 155, entryTime: '2025-01-01T14:30:00Z', exitTime: '2025-01-01T15:00:00Z' },
        { side: 'long', quantity: 50, entryPrice: 152, exitPrice: null, entryTime: '2025-01-01T14:40:00Z', exitTime: null }
      ]
    };
    const diagnostics = makeDiagnostics();

    const [result] = repairTradeReversals([trade], diagnostics);

    expect(result).toBe(trade);
    expect(result.executions).toHaveLength(2);
    expect(diagnostics.warnings).toHaveLength(0);
  });
});
