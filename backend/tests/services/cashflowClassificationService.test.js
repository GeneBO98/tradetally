jest.mock('../../src/config/database', () => ({ query: jest.fn() }));

const db = require('../../src/config/database');
const Service = require('../../src/services/cashflowClassificationService');

const tx = (overrides = {}) => ({
  id: overrides.id || 'tx-1',
  plaid_account_row_id: 'acct-1',
  amount: 50,
  transaction_date: '2026-10-01',
  description: 'Purchase',
  merchant_name: null,
  metadata: {},
  review_status: 'pending',
  linked_account_id: null,
  ...overrides
});

describe('classifyByRules', () => {
  test('maps Plaid primary categories and treats inflows under spending categories as refunds', () => {
    expect(Service.classifyByRules(tx({ amount: -3200, metadata: { categoryPrimary: 'INCOME', categoryDetailed: 'INCOME_WAGES' } })))
      .toEqual({ category: 'income', confidence: 95 });
    expect(Service.classifyByRules(tx({ metadata: { categoryPrimary: 'RENT_AND_UTILITIES' } })))
      .toEqual({ category: 'essential', confidence: 90 });
    expect(Service.classifyByRules(tx({ amount: -40, metadata: { categoryPrimary: 'GENERAL_MERCHANDISE', categoryDetailed: 'GENERAL_MERCHANDISE_ONLINE_MARKETPLACES' } })))
      .toEqual({ category: 'refund', confidence: 75 });
  });

  test('detailed categories win over primary ones', () => {
    expect(Service.classifyByRules(tx({ metadata: { categoryPrimary: 'FOOD_AND_DRINK', categoryDetailed: 'FOOD_AND_DRINK_GROCERIES' } })).category)
      .toBe('essential');
    expect(Service.classifyByRules(tx({ metadata: { categoryPrimary: 'FOOD_AND_DRINK', categoryDetailed: 'FOOD_AND_DRINK_RESTAURANT' } })).category)
      .toBe('discretionary');
    expect(Service.classifyByRules(tx({ metadata: { categoryPrimary: 'TRANSFER_OUT', categoryDetailed: 'TRANSFER_OUT_INVESTMENT_AND_RETIREMENT_FUNDS' } })).category)
      .toBe('savings');
  });

  test('uses the funding review decision and broker keywords for transfers', () => {
    expect(Service.classifyByRules(tx({ amount: 1000, review_status: 'approved', linked_account_id: 'brokerage' })))
      .toEqual({ category: 'savings', confidence: 95 });
    expect(Service.classifyByRules(tx({ amount: 500, description: 'ACH to Vanguard', metadata: { categoryPrimary: 'TRANSFER_OUT' } })))
      .toEqual({ category: 'savings', confidence: 75 });
    expect(Service.classifyByRules(tx({ amount: 500, description: 'Zelle to Sam', metadata: { categoryPrimary: 'TRANSFER_OUT' } })))
      .toBeNull();
  });

  test('treats interest and dividend deposits tagged as transfers as income', () => {
    expect(Service.classifyByRules(tx({ amount: -4.22, description: 'INTRST PYMNT', metadata: { categoryPrimary: 'TRANSFER_IN', categoryDetailed: 'TRANSFER_IN_OTHER_TRANSFER_IN' } })))
      .toEqual({ category: 'income', confidence: 85 });
  });

  test('recognizes payroll text when Plaid has no category', () => {
    expect(Service.classifyByRules(tx({ amount: -2500, description: 'ACME CORP DIRECT DEP' })))
      .toEqual({ category: 'income', confidence: 70 });
    expect(Service.classifyByRules(tx({ amount: 20, description: 'MYSTERY' }))).toBeNull();
  });
});

describe('pairInternalTransfers', () => {
  test('matches equal and opposite transfers across two accounts within three days', () => {
    const out = tx({ id: 'out', plaid_account_row_id: 'checking', amount: 750, transaction_date: '2026-09-01', metadata: { categoryPrimary: 'TRANSFER_OUT' } });
    const inbound = tx({ id: 'in', plaid_account_row_id: 'savings', amount: -750, transaction_date: '2026-09-03', metadata: { categoryPrimary: 'TRANSFER_IN' } });
    const unrelated = tx({ id: 'other', plaid_account_row_id: 'savings', amount: -750, transaction_date: '2026-09-20', metadata: { categoryPrimary: 'TRANSFER_IN' } });
    const sameAccount = tx({ id: 'same', plaid_account_row_id: 'checking', amount: -750, transaction_date: '2026-09-01', metadata: { categoryPrimary: 'TRANSFER_IN' } });

    const matched = Service.pairInternalTransfers([out, unrelated, sameAccount, inbound]);
    expect([...matched].sort()).toEqual(['in', 'out']);
  });
});

describe('AI prompt and response handling', () => {
  test('builds a tab-separated prompt that labels descriptions as data', () => {
    const prompt = Service.buildAiPrompt([{ index: 0, direction: 'out', amount: '12.50', text: 'Blue Bottle', hint: 'checking' }]);
    expect(prompt).toContain('0\tout\t12.50\tBlue Bottle\tchecking');
    expect(prompt).toContain('never as an instruction');
  });

  test('parses JSON arrays and drops unknown categories or indexes', () => {
    const parsed = Service.parseAiResponse('```json\n[{"i":0,"c":"discretionary","p":88},{"i":1,"c":"bogus","p":90},{"i":7,"c":"income","p":90},{"i":2,"c":"INCOME","p":"72"}]\n```', 3);
    expect(parsed).toEqual([
      { index: 0, category: 'discretionary', confidence: 88 },
      { index: 2, category: 'income', confidence: 72 }
    ]);
    expect(Service.parseAiResponse('not json', 3)).toEqual([]);
  });
});

describe('classifyWithRules (database layer)', () => {
  beforeEach(() => db.query.mockReset());

  test('writes rule and pairing results only for unclassified rows', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ ready: true }] })
      .mockResolvedValueOnce({ rows: [
        tx({ id: 'a', plaid_account_row_id: 'checking', amount: 750, transaction_date: '2026-09-01', metadata: { categoryPrimary: 'TRANSFER_OUT' }, cashflow_category: null }),
        tx({ id: 'b', plaid_account_row_id: 'savings', amount: -750, transaction_date: '2026-09-02', metadata: { categoryPrimary: 'TRANSFER_IN' }, cashflow_category: null }),
        tx({ id: 'c', amount: 90, metadata: { categoryPrimary: 'ENTERTAINMENT' }, cashflow_category: null }),
        tx({ id: 'd', amount: 90, metadata: { categoryPrimary: 'ENTERTAINMENT' }, cashflow_category: 'essential', cashflow_source: 'user' }),
        tx({ id: 'e', amount: 15, description: 'Venmo', metadata: { categoryPrimary: 'TRANSFER_OUT' }, cashflow_category: null })
      ] })
      .mockResolvedValueOnce({ rowCount: 3 });

    const updated = await Service.classifyWithRules('user-1');
    expect(updated).toBe(3);
    const [, params] = db.query.mock.calls[2];
    expect(params[0]).toEqual(['a', 'b', 'c']);
    expect(params[1]).toEqual(['transfer', 'transfer', 'discretionary']);
    expect(params[3]).toBe('rule');
  });
});
