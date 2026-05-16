jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  connect: jest.fn()
}));

const db = require('../../src/config/database');
const Account = require('../../src/models/Account');

describe('Account import reconciliation admin review', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  function mockClient(responses = []) {
    const client = {
      query: jest.fn(),
      release: jest.fn()
    };
    responses.forEach(response => client.query.mockResolvedValueOnce(response));
    db.connect.mockResolvedValueOnce(client);
    return client;
  }

  test('lists reconciliation rows with user and resolved account context', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'recon-1',
        user_id: 'user-1',
        user_email: 'trader@example.com',
        username: 'trader',
        import_id: 'import-1',
        account_identifier: 'UNKNOWN-123',
        broker: 'IBKR',
        source: 'csv_import',
        status: 'pending',
        sample_count: 4,
        resolved_account_id: null,
        resolved_account_name: null,
        last_audit_id: 'audit-1',
        last_audit_action: 'ignore',
        last_audit_reason: 'Reviewed by ops',
        last_audit_at: '2026-05-11T14:05:00.000Z',
        last_seen_at: '2026-05-11T14:00:00.000Z'
      }]
    });

    const rows = await Account.listImportReconciliationsForAdmin({ status: 'pending' });

    expect(db.query.mock.calls[0][0]).toContain('LEFT JOIN users');
    expect(db.query.mock.calls[0][0]).toContain('LEFT JOIN user_accounts');
    expect(db.query.mock.calls[0][0]).toContain('import_account_reconciliation_audits');
    expect(rows[0]).toMatchObject({
      id: 'recon-1',
      userEmail: 'trader@example.com',
      accountIdentifier: 'UNKNOWN-123',
      status: 'pending',
      sampleCount: 4,
      lastAuditReason: 'Reviewed by ops'
    });
  });

  test('reviews reconciliation rows as resolved, ignored, or pending', async () => {
    const beforeRow = {
      id: 'recon-1',
      user_id: 'user-1',
      account_identifier: 'UNKNOWN-123',
      source: 'csv_import',
      status: 'pending',
      sample_count: 4,
      resolved_account_id: null,
      last_error: null,
      resolved_at: null
    };
    const afterRow = {
      ...beforeRow,
      status: 'ignored',
      last_error: 'Duplicate account alias'
    };
    const client = mockClient([
      { rows: [] },
      { rows: [beforeRow] },
      { rows: [afterRow] },
      {
        rows: [{
          id: 'audit-1',
          reconciliation_id: 'recon-1',
          action: 'ignore',
          actor_user_id: 'admin-1',
          reason: 'Duplicate account alias',
          before_state: beforeRow,
          after_state: afterRow,
          bulk_action_id: null,
          created_at: '2026-05-11T14:05:00.000Z'
        }]
      },
      { rows: [] }
    ]);

    const row = await Account.runImportReconciliationAction('recon-1', 'ignore', {
      reason: 'Duplicate account alias'
    }, 'admin-1');

    expect(client.query.mock.calls[2][0]).toContain('UPDATE import_account_reconciliations');
    expect(client.query.mock.calls[2][1]).toEqual([
      'recon-1',
      'ignored',
      null,
      'Duplicate account alias'
    ]);
    expect(client.query.mock.calls[3][0]).toContain('INSERT INTO import_account_reconciliation_audits');
    expect(row).toMatchObject({
      id: 'recon-1',
      status: 'ignored',
      lastError: 'Duplicate account alias',
      audit: {
        action: 'ignore',
        reason: 'Duplicate account alias'
      }
    });
  });

  test('previews bulk reconciliation actions without updating rows', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'recon-1',
        user_id: 'user-1',
        account_identifier: 'UNKNOWN-123',
        source: 'csv_import',
        status: 'pending',
        sample_count: 4
      }]
    });

    const result = await Account.runBulkImportReconciliationAction({
      reconciliationIds: ['recon-1'],
      action: 'ignore',
      reason: 'Bulk duplicate review',
      preview: true
    }, 'admin-1');

    expect(db.query.mock.calls[0][0]).toContain('WHERE id = ANY');
    expect(result).toMatchObject({
      preview: true,
      action: 'ignore',
      affectedCount: 1
    });
    expect(db.connect).not.toHaveBeenCalled();
  });
});
