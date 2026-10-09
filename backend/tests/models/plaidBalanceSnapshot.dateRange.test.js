jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
const db = require('../../src/config/database');
const Snapshot = require('../../src/models/PlaidBalanceSnapshot');
beforeEach(() => { jest.clearAllMocks(); db.query.mockResolvedValue({ rows: [] }); });
test('bounds balance history inclusively and retains user/account isolation', async () => {
  await Snapshot.getHistory('owner', { days: 90, start_date: '2026-08-01', end_date: '2026-08-31', plaidAccountRowId: 'account-1' });
  const [sql, params] = db.query.mock.calls[0];
  expect(sql).toContain('s.user_id = $1');
  expect(sql).toContain('s.snapshot_date >= $2::date AND s.snapshot_date <= $3::date');
  expect(sql).toContain('s.plaid_account_row_id = $4');
  expect(params).toEqual(['owner', '2026-08-01', '2026-08-31', 'account-1']);
  expect(sql).not.toContain('CURRENT_DATE');
  expect(db.query.mock.calls[1][0]).toContain('s.snapshot_date <= $3::date');
  expect(db.query.mock.calls[1][1]).toEqual(params);
});
test('keeps legacy days-based history unchanged', async () => {
  await Snapshot.getHistory('owner', { days: 30 });
  expect(db.query.mock.calls[0][0]).toContain('CURRENT_DATE');
  expect(db.query.mock.calls[0][1]).toEqual(['owner', 30]);
});
