jest.mock('../../src/services/plaid/plaidClient', () => ({ getLiabilities: jest.fn() }));
jest.mock('../../src/models/PlaidLiability', () => ({
  hasSchema: jest.fn(async () => true),
  replaceForConnection: jest.fn(async (connectionId, userId, rows) => rows.length)
}));

const plaidClient = require('../../src/services/plaid/plaidClient');
const PlaidLiability = require('../../src/models/PlaidLiability');
const service = require('../../src/services/plaid/plaidLiabilitiesSyncService');

const accountMap = new Map([
  ['card', { id: 'row-card', currentBalance: 2400, currencyCode: 'USD' }],
  ['home', { id: 'row-home', currentBalance: 310000, currencyCode: 'USD' }],
  ['loan', { id: 'row-loan', currentBalance: 18000, currencyCode: 'USD' }]
]);

describe('mapLiabilities', () => {
  test('flattens credit, mortgage and student liabilities onto one row shape', () => {
    const rows = service.mapLiabilities({
      liabilities: {
        credit: [{ account_id: 'card', aprs: [{ apr_type: 'cash_apr', apr_percentage: 29.9 }, { apr_type: 'purchase_apr', apr_percentage: 21.5 }], minimum_payment_amount: 75, last_payment_amount: 300, last_payment_date: '2026-10-02', next_payment_due_date: '2026-11-01', is_overdue: false }],
        mortgage: [{ account_id: 'home', interest_rate: { percentage: 6.25, type: 'fixed' }, next_monthly_payment: 2100, origination_date: '2021-05-01', maturity_date: '2051-05-01', past_due_amount: 0 }],
        student: [{ account_id: 'loan', interest_rate_percentage: 5.5, minimum_payment_amount: 210, origination_date: '2015-08-15', expected_payoff_date: '2030-08-15', is_overdue: true }],
        unknown: [{ account_id: 'card' }]
      }
    }, accountMap);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ plaidAccountRowId: 'row-card', liabilityType: 'credit', currentBalance: 2400, aprPercent: 21.5, minimumPayment: 75, isOverdue: false });
    expect(rows[1]).toMatchObject({ plaidAccountRowId: 'row-home', liabilityType: 'mortgage', aprPercent: 6.25, minimumPayment: 2100, maturityDate: '2051-05-01', isOverdue: false });
    expect(rows[2]).toMatchObject({ plaidAccountRowId: 'row-loan', liabilityType: 'student', aprPercent: 5.5, minimumPayment: 210, maturityDate: '2030-08-15', isOverdue: true });
  });

  test('skips liabilities for accounts that were not synced', () => {
    const rows = service.mapLiabilities({ liabilities: { credit: [{ account_id: 'ghost' }] } }, accountMap);
    expect(rows).toEqual([]);
  });
});

describe('syncLiabilities', () => {
  beforeEach(() => {
    plaidClient.getLiabilities.mockReset();
    PlaidLiability.replaceForConnection.mockClear();
  });

  test('uses fresh balances from the liabilities payload and stores the rows', async () => {
    plaidClient.getLiabilities.mockResolvedValueOnce({
      accounts: [{ account_id: 'card', balances: { current: 2650 } }],
      liabilities: { credit: [{ account_id: 'card', aprs: [], minimum_payment_amount: 80 }] }
    });
    const stored = await service.syncLiabilities({ id: 'conn', userId: 'user', accessToken: 'tok' }, accountMap);
    expect(stored).toBe(1);
    const [, , rows] = PlaidLiability.replaceForConnection.mock.calls[0];
    expect(rows[0]).toMatchObject({ currentBalance: 2650, minimumPayment: 80 });
  });

  test('returns null when the Item has no liabilities product', async () => {
    const error = new Error('Plaid request failed');
    error.plaid = { errorCode: 'PRODUCTS_NOT_SUPPORTED' };
    plaidClient.getLiabilities.mockRejectedValueOnce(error);
    await expect(service.syncLiabilities({ id: 'conn', userId: 'user', accessToken: 'tok' }, accountMap)).resolves.toBeNull();
    expect(PlaidLiability.replaceForConnection).not.toHaveBeenCalled();
  });

  test('rethrows unexpected Plaid errors', async () => {
    const error = new Error('rate limited');
    error.plaid = { errorCode: 'RATE_LIMIT_EXCEEDED' };
    plaidClient.getLiabilities.mockRejectedValueOnce(error);
    await expect(service.syncLiabilities({ id: 'conn', userId: 'user', accessToken: 'tok' }, accountMap)).rejects.toThrow('rate limited');
  });
});
