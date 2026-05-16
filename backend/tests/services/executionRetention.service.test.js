jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const ExecutionRetentionService = require('../../src/services/executionRetentionService');

describe('ExecutionRetentionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('runs the default retention policy and stores deletion counts', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'policy-1',
          policy_name: 'default',
          is_enabled: true,
          event_retention_days: 365,
          telemetry_retention_days: 90,
          report_access_retention_days: 365,
          last_run_at: null,
          last_deleted_counts: {}
        }]
      })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: 3 })
      .mockResolvedValueOnce({ rowCount: 4 })
      .mockResolvedValueOnce({
        rows: [{
          id: 'policy-1',
          policy_name: 'default',
          is_enabled: true,
          event_retention_days: 365,
          telemetry_retention_days: 90,
          report_access_retention_days: 365,
          last_run_at: '2026-05-11T14:00:00.000Z',
          last_deleted_counts: { executionRunEvents: 2, clientErrorEvents: 3, reportAccesses: 4 }
        }]
      });

    const result = await ExecutionRetentionService.runDefaultPolicy();

    expect(result.deletedCounts).toEqual({
      executionRunEvents: 2,
      clientErrorEvents: 3,
      reportAccesses: 4
    });
    expect(db.query.mock.calls[1][0]).toContain('DELETE FROM execution_run_events');
    expect(db.query.mock.calls[2][0]).toContain('DELETE FROM client_error_events');
    expect(db.query.mock.calls[3][0]).toContain('DELETE FROM execution_run_report_accesses');
  });

  test('previews retention candidates without deleting rows', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'policy-1',
          policy_name: 'default',
          is_enabled: true,
          event_retention_days: 365,
          telemetry_retention_days: 90,
          report_access_retention_days: 365,
          last_run_at: null,
          last_deleted_counts: {}
        }]
      })
      .mockResolvedValueOnce({ rows: [{ count: 7 }] })
      .mockResolvedValueOnce({ rows: [{ count: 8 }] })
      .mockResolvedValueOnce({ rows: [{ count: 9 }] });

    const result = await ExecutionRetentionService.previewDefaultPolicy();

    expect(result.candidateCounts).toEqual({
      executionRunEvents: 7,
      clientErrorEvents: 8,
      reportAccesses: 9
    });
    expect(db.query.mock.calls.map(call => call[0]).join('\n')).not.toContain('DELETE FROM');
  });

  test('creates a pending retention policy revision before applying changes', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'policy-1',
          policy_name: 'default',
          is_enabled: true,
          event_retention_days: 365,
          telemetry_retention_days: 90,
          report_access_retention_days: 365,
          last_run_at: null,
          last_deleted_counts: {}
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'revision-1',
          policy_id: 'policy-1',
          actor_user_id: 'admin-1',
          change_type: 'update',
          before_policy: { eventRetentionDays: 365 },
          after_policy: { eventRetentionDays: 730 },
          approval_status: 'pending',
          requested_at: '2026-05-11T14:00:00.000Z'
        }]
      });

    const revision = await ExecutionRetentionService.requestDefaultPolicyUpdate({
      eventRetentionDays: 730
    }, 'admin-1');

    expect(db.query.mock.calls[1][0]).toContain('INSERT INTO execution_retention_policy_revisions');
    expect(JSON.parse(db.query.mock.calls[1][1][3])).toMatchObject({
      eventRetentionDays: 730,
      telemetryRetentionDays: 90,
      reportAccessRetentionDays: 365
    });
    expect(revision.approvalStatus).toBe('pending');
  });
});
