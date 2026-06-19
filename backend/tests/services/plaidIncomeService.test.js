jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/models/PlaidConnection', () => ({
  hasSchema: jest.fn()
}));

const db = require('../../src/config/database');
const PlaidConnection = require('../../src/models/PlaidConnection');
const plaidIncomeService = require('../../src/services/plaid/plaidIncomeService');
const { classifyIncome } = require('../../src/services/plaid/plaidIncomeService');

describe('classifyIncome', () => {
  it.each([
    ['cash', 'dividend', 'dividend'],
    ['cash', 'qualified dividend', 'dividend'],
    ['cash', 'non-qualified dividend', 'dividend'],
    ['cash', 'interest', 'interest'],
    ['cash', 'interest receivable', 'interest'],
    ['fee', 'account fee', 'fee'],
    ['fee', 'management fee', 'fee'],
    ['fee', 'transfer fee', 'fee'],
    ['fee', 'tax withheld', 'fee'],
    ['fee', 'unknown subtype', 'fee'],
    ['buy', 'buy', null],
    ['sell', 'sell', null],
    ['transfer', 'deposit', null],
    [null, null, null]
  ])('classifies type=%s subtype=%s as %s', (type, subtype, expected) => {
    expect(classifyIncome(type, subtype)).toBe(expected);
  });

  it('is case and whitespace insensitive', () => {
    expect(classifyIncome('CASH', ' Dividend ')).toBe('dividend');
  });
});

describe('getIncomeSummary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    PlaidConnection.hasSchema.mockResolvedValue(true);
  });

  function row(overrides = {}) {
    return {
      amount: '-10.50',
      transaction_date: '2026-05-15',
      description: 'AAPL dividend',
      investment_type: 'cash',
      investment_subtype: 'dividend',
      symbol_label: 'AAPL',
      ...overrides
    };
  }

  it('flips the sign for income and keeps it for fees', async () => {
    db.query.mockResolvedValue({
      rows: [
        row(),
        row({ amount: '-2.25', investment_subtype: 'interest', symbol_label: null, transaction_date: '2026-05-20' }),
        row({ amount: '5.00', investment_type: 'fee', investment_subtype: 'management fee', symbol_label: null, transaction_date: '2026-05-21' })
      ]
    });

    const result = await plaidIncomeService.getIncomeSummary('user-1', {});

    expect(result.summary.totalDividends).toBe(10.5);
    expect(result.summary.totalInterest).toBe(2.25);
    expect(result.summary.totalFees).toBe(5);
  });

  it('groups by month and by symbol', async () => {
    db.query.mockResolvedValue({
      rows: [
        row({ transaction_date: '2026-04-15', amount: '-10.00' }),
        row({ transaction_date: '2026-05-15', amount: '-12.00' }),
        row({ transaction_date: '2026-05-16', amount: '-3.00', symbol_label: 'MSFT' })
      ]
    });

    const result = await plaidIncomeService.getIncomeSummary('user-1', {});

    expect(result.byMonth).toEqual([
      expect.objectContaining({ month: '2026-04', dividends: 10 }),
      expect.objectContaining({ month: '2026-05', dividends: 15 })
    ]);
    expect(result.bySymbol[0]).toEqual(expect.objectContaining({ symbol: 'AAPL', dividends: 22 }));
    expect(result.bySymbol[1]).toEqual(expect.objectContaining({ symbol: 'MSFT', dividends: 3 }));
  });

  it('ignores buys, sells and transfers', async () => {
    db.query.mockResolvedValue({
      rows: [
        row({ investment_type: 'buy', investment_subtype: 'buy', amount: '500.00' }),
        row({ investment_type: 'transfer', investment_subtype: 'deposit', amount: '-1000.00' })
      ]
    });

    const result = await plaidIncomeService.getIncomeSummary('user-1', {});

    expect(result.summary.totalDividends).toBe(0);
    expect(result.byMonth).toEqual([]);
  });

  it('labels transactions without a known security as Unknown', async () => {
    db.query.mockResolvedValue({ rows: [row({ symbol_label: null })] });

    const result = await plaidIncomeService.getIncomeSummary('user-1', {});

    expect(result.bySymbol[0].symbol).toBe('Unknown');
  });

  it('returns an empty summary when the plaid schema is missing', async () => {
    PlaidConnection.hasSchema.mockResolvedValue(false);

    const result = await plaidIncomeService.getIncomeSummary('user-1', {});

    expect(result).toEqual(plaidIncomeService.emptySummary());
    expect(db.query).not.toHaveBeenCalled();
  });
});
