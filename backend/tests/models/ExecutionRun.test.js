jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  connect: jest.fn()
}));

const db = require('../../src/config/database');
const ExecutionRun = require('../../src/models/ExecutionRun');
const { executionRunModesFixture, executionRunRow } = require('../fixtures/executionRun.fixtures');

function mockClient() {
  const client = {
    query: jest.fn(),
    release: jest.fn()
  };
  db.connect.mockResolvedValue(client);
  return client;
}

describe('ExecutionRun model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('creates a shared run for live, replay, or backtest flows and records an audit event', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [executionRunRow({ mode: 'backtest', name: 'ORB replay', config: { symbol: 'AAPL' } })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'event-1',
          run_id: 'run-backtest',
          event_type: 'run.created',
          payload: {},
          previous_event_hash: null,
          event_hash: 'hash-created',
          created_at: '2026-05-11T13:30:00.000Z'
        }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const run = await ExecutionRun.create('user-1', {
      mode: 'backtest',
      name: 'ORB replay',
      source: 'ui',
      config: { symbol: 'AAPL' }
    });

    expect(client.query.mock.calls[1][0]).toContain('INSERT INTO execution_runs');
    expect(client.query.mock.calls[1][1][5]).toBe(JSON.stringify({ symbol: 'AAPL' }));
    const eventInsertCall = client.query.mock.calls.find(call => call[0].includes('INSERT INTO execution_run_events'));
    expect(eventInsertCall[1][1]).toBe('run.created');
    expect(client.query.mock.calls[4][0]).toBe('COMMIT');
    expect(run).toMatchObject({
      id: 'run-backtest',
      userId: 'user-1',
      mode: 'backtest',
      status: 'created'
    });
  });

  test('rejects unsupported execution modes before writing', async () => {
    await expect(
      ExecutionRun.create('user-1', { mode: 'paper-ish' })
    ).rejects.toThrow('Unsupported execution run mode');

    expect(db.connect).not.toHaveBeenCalled();
  });

  test('rejects invalid lineage parent mode before writing', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{ id: 'run-live', user_id: 'user-1', mode: 'live' }]
    });

    await expect(
      ExecutionRun.create('user-1', {
        mode: 'backtest',
        parentRunId: 'run-live',
        lineageType: 'backtest_of'
      })
    ).rejects.toThrow('backtest_of lineage requires backtest child and replay parent');

    expect(db.connect).not.toHaveBeenCalled();
  });

  test('lists all deterministic run modes used by live replay and backtest sync tests', async () => {
    db.query.mockResolvedValueOnce({ rows: executionRunModesFixture() });

    const runs = await ExecutionRun.findByUser('user-1');

    expect(runs.map(run => run.mode)).toEqual(['live', 'replay', 'backtest']);
  });

  test('records status-change and update events when a run changes lifecycle state', async () => {
    db.query.mockResolvedValueOnce({
      rows: [executionRunRow({ id: 'run-live', mode: 'live', status: 'running' })]
    });

    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [executionRunRow({
          id: 'run-live',
          mode: 'live',
          status: 'completed',
          metrics: { trades: 3 },
          ended_at: '2026-05-11T14:00:00.000Z'
        })]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'event-1', run_id: 'run-live', event_type: 'run.status_changed', payload: {}, previous_event_hash: null, event_hash: 'hash-1', created_at: '2026-05-11T14:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ event_hash: 'hash-1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'event-2', run_id: 'run-live', event_type: 'run.updated', payload: {}, previous_event_hash: 'hash-1', event_hash: 'hash-2', created_at: '2026-05-11T14:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] });

    const run = await ExecutionRun.update('user-1', 'run-live', {
      status: 'completed',
      metrics: { trades: 3 },
      endedAt: '2026-05-11T14:00:00.000Z'
    });

    expect(run.status).toBe('completed');
    const eventInsertCalls = client.query.mock.calls.filter(call => call[0].includes('INSERT INTO execution_run_events'));
    expect(eventInsertCalls[0][1][1]).toBe('run.status_changed');
    expect(eventInsertCalls[1][1][1]).toBe('run.updated');
  });

  test('compares latest live, replay, and backtest metrics from the same source', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          source: 'trade-management',
          confidence_levels: [0.9, 0.95, 0.99],
          shared_report_access_threshold: 10,
          shared_report_access_window_minutes: 15
        }]
      })
      .mockResolvedValueOnce({
        rows: [
          executionRunRow({ mode: 'live', metrics: { tradeCount: 3, totalR: 1.5 } }),
          executionRunRow({ mode: 'replay', metrics: { tradeCount: 3, totalR: 2 } }),
          executionRunRow({ mode: 'backtest', metrics: { tradeCount: 3, totalR: 2.5 } })
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { mode: 'live', metrics: { tradeCount: 3, totalR: 1 } },
          { mode: 'live', metrics: { tradeCount: 4, totalR: 2 } },
          { mode: 'backtest', metrics: { tradeCount: 3, totalR: 2.5 } }
        ]
      });

    const comparison = await ExecutionRun.compareByModes('user-1', { source: 'trade-management' });

    expect(db.query.mock.calls[0][0]).toContain('FROM execution_workflow_settings');
    expect(db.query.mock.calls[1][1]).toEqual(['user-1', 'trade-management']);
    expect(db.query.mock.calls[1][0]).toContain("CASE WHEN metrics <> '{}'::jsonb THEN 0 ELSE 1 END");
    expect(db.query.mock.calls[1][0]).toContain("CASE WHEN status = 'completed' THEN 0 ELSE 1 END");
    expect(comparison.runs.map(run => run.mode)).toEqual(['live', 'replay', 'backtest']);
    expect(comparison.confidenceLevels).toEqual([0.9, 0.95, 0.99]);
    expect(comparison.metrics.find(metric => metric.key === 'totalR')).toMatchObject({
      byMode: { live: 1.5, replay: 2, backtest: 2.5 },
      deltasFromLive: { live: 0, replay: 0.5, backtest: 1 },
      confidenceByMode: {
        live: { count: 2 },
        replay: { count: 0 },
        backtest: { count: 1 }
      }
    });
    expect(comparison.metrics.find(metric => metric.key === 'totalR').confidenceByMode.live.intervals.p99).toBeDefined();
  });

  test('honors requested confidence levels for workflow comparisons', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          source: 'trade-management',
          confidence_levels: [0.95],
          shared_report_access_threshold: 10,
          shared_report_access_window_minutes: 15
        }]
      })
      .mockResolvedValueOnce({
        rows: [
          executionRunRow({ mode: 'backtest', metrics: { totalR: 2.5 } })
        ]
      })
      .mockResolvedValueOnce({
        rows: [
          { mode: 'backtest', metrics: { totalR: 2 } },
          { mode: 'backtest', metrics: { totalR: 3 } },
          { mode: 'backtest', metrics: { totalR: 4 } }
        ]
      });

    const comparison = await ExecutionRun.compareByModes('user-1', {
      source: 'trade-management',
      confidenceLevels: '0.9,0.99'
    });

    const totalR = comparison.metrics.find(metric => metric.key === 'totalR');
    expect(comparison.confidenceLevels).toEqual([0.9, 0.99]);
    expect(totalR.confidenceByMode.backtest.intervals.p90).toBeDefined();
    expect(totalR.confidenceByMode.backtest.intervals.p99).toBeDefined();
    expect(totalR.confidenceByMode.backtest.intervals.p95).toBeUndefined();
  });

  test('shares a run and records the share event atomically', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ share_token: null }] })
      .mockResolvedValueOnce({
        rows: [executionRunRow({
          id: 'run-live',
          mode: 'live',
          share_token: 'share-token'
        })]
      })
      .mockResolvedValueOnce({
        rows: []
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'event-share', run_id: 'run-live', event_type: 'run.shared', payload: {}, previous_event_hash: null, event_hash: 'hash-share', created_at: '2026-05-11T14:00:00.000Z' }]
      })
      .mockResolvedValueOnce({
        rows: [{ id: 'share-audit-1', run_id: 'run-live', action: 'share', scope: {}, created_at: '2026-05-11T14:00:00.000Z' }]
      })
      .mockResolvedValueOnce({ rows: [] });

    const run = await ExecutionRun.share('user-1', 'run-live', {
      expiresAt: '2030-05-12T00:00:00.000Z',
      formats: ['json', 'pdf'],
      includeReportAccesses: false
    });

    const updateCall = client.query.mock.calls.find(call => call[0].includes('share_token = $3'));
    expect(updateCall[1][2]).toMatch(/^v1\./);
    expect(updateCall[1][4]).toBe(JSON.stringify({
      formats: ['json', 'pdf'],
      includeEvents: true,
      includeMetrics: true,
      includeReportAccesses: false,
      template: 'trader',
      recipient: null,
      watermark: null,
      accountIds: []
    }));
    const eventCall = client.query.mock.calls.find(call => call[0].includes('INSERT INTO execution_run_events'));
    expect(eventCall[1][1]).toBe('run.shared');
    expect(client.query.mock.calls[6][0]).toBe('COMMIT');
    expect(run.isShared).toBe(true);
  });

  test('looks up signed scoped share links with token integrity checks', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ share_token: null }] })
      .mockResolvedValueOnce({ rows: [executionRunRow({ id: 'run-live', share_token: 'ignored' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'event-share', run_id: 'run-live', event_type: 'run.shared', payload: {}, previous_event_hash: null, event_hash: 'hash-share', created_at: '2026-05-11T14:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'share-audit-1', run_id: 'run-live', action: 'share', scope: {}, created_at: '2026-05-11T14:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] });

    await ExecutionRun.share('user-1', 'run-live', {
      expiresAt: '2030-05-12T00:00:00.000Z',
      formats: ['json']
    });
    const signedToken = client.query.mock.calls.find(call => call[0].includes('share_token = $3'))[1][2];

    db.query.mockResolvedValueOnce({
      rows: [executionRunRow({
        id: 'run-live',
        share_token: signedToken,
        share_scope: {
          formats: ['json'],
          includeEvents: true,
          includeMetrics: true,
          includeReportAccesses: false,
          template: 'trader',
          recipient: null,
          watermark: null,
          accountIds: []
        }
      })]
    });

    const run = await ExecutionRun.findByShareToken(signedToken);

    expect(db.query.mock.calls[0][0]).toContain('AND er.id = $2');
    expect(db.query.mock.calls[0][1]).toEqual([signedToken, 'run-live']);
    expect(run.verifiedShareScope.formats).toEqual(['json']);
  });

  test('denies signed shared links whose account scope does not match the run', async () => {
    const client = mockClient();
    client.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ share_token: null }] })
      .mockResolvedValueOnce({ rows: [executionRunRow({ id: 'run-live', share_token: 'ignored' })] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'event-share', run_id: 'run-live', event_type: 'run.shared', payload: {}, previous_event_hash: null, event_hash: 'hash-share', created_at: '2026-05-11T14:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'share-audit-1', run_id: 'run-live', action: 'share', scope: {}, created_at: '2026-05-11T14:00:00.000Z' }] })
      .mockResolvedValueOnce({ rows: [] });

    await ExecutionRun.share('user-1', 'run-live', {
      expiresAt: '2030-05-12T00:00:00.000Z',
      formats: ['json'],
      accountIds: ['ACC-LOCKED']
    });
    const signedToken = client.query.mock.calls.find(call => call[0].includes('share_token = $3'))[1][2];

    db.query.mockResolvedValueOnce({
      rows: [executionRunRow({
        id: 'run-live',
        share_token: signedToken,
        config: { accountId: 'ACC-OTHER' },
        share_scope: {
          formats: ['json'],
          includeEvents: true,
          includeMetrics: true,
          includeReportAccesses: false,
          template: 'trader',
          recipient: null,
          watermark: null,
          accountIds: ['ACC-LOCKED']
        }
      })]
    });

    await expect(ExecutionRun.findByShareToken(signedToken)).resolves.toBeNull();
  });

  test('generates a report with run summary and ordered events', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [executionRunRow({ id: 'run-live', mode: 'live', status: 'completed', metrics: { totalR: 1.5 } })] })
      .mockResolvedValueOnce({ rows: [executionRunRow({ id: 'run-live', mode: 'live', status: 'completed', metrics: { totalR: 1.5 } })] })
      .mockResolvedValueOnce({
        rows: [
          { id: 'event-1', run_id: 'run-live', event_type: 'run.created', payload: {}, created_at: '2026-05-11T13:30:00.000Z' },
          { id: 'event-2', run_id: 'run-live', event_type: 'run.status_changed', payload: { to: 'completed' }, created_at: '2026-05-11T14:00:00.000Z' }
        ]
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [{
          template_key: 'trader',
          label: 'Trader Workbook',
          description: 'Trader report',
          sections: [{ key: 'overview', label: 'Run Overview', enabled: true }],
          share_defaults: { formats: ['json', 'pdf'] },
          is_enabled: true
        }]
      });

    const report = await ExecutionRun.getReport('user-1', 'run-live');

    expect(report.run.id).toBe('run-live');
    expect(report.summary).toMatchObject({
      mode: 'live',
      status: 'completed',
      eventCount: 2,
      metrics: { totalR: 1.5 }
    });
    expect(report.events.map(event => event.eventType)).toEqual(['run.created', 'run.status_changed']);
    expect(report.templateConfig.label).toBe('Trader Workbook');
  });

  test('rejects account-restricted share scopes when a run has no matching account', () => {
    expect(ExecutionRun.shareScopeAllowsRun({
      config: { accountId: 'ACC-1' },
      marketDataSnapshot: { accountIdentifier: 'ACC-2' }
    }, {
      accountIds: ['ACC-3']
    })).toBe(false);

    expect(ExecutionRun.shareScopeAllowsRun({
      config: { accountId: 'ACC-1' }
    }, {
      accountIds: ['ACC-1']
    })).toBe(true);
  });

  test('enforces account share scope across imported, live, replay, and backtest lineage payloads', () => {
    const runs = [
      { mode: 'live', source: 'broker-import', config: { accountIdentifier: 'IMP-1' } },
      { mode: 'live', source: 'live-execution', marketDataSnapshot: { accountId: 'LIVE-1' } },
      { mode: 'replay', source: 'trade-management', config: { accountIds: ['REPLAY-1'] } },
      { mode: 'backtest', source: 'trade-management', config: { account: { accountIdentifier: 'BT-1' } } }
    ];

    expect(runs.map(run => ExecutionRun.shareScopeAllowsRun(run, {
      accountIds: ['IMP-1', 'LIVE-1', 'REPLAY-1', 'BT-1']
    }))).toEqual([true, true, true, true]);
    expect(runs.map(run => ExecutionRun.shareScopeAllowsRun(run, {
      accountIds: ['OTHER']
    }))).toEqual([false, false, false, false]);
  });

  test('lists share-scope account options from owned account records only', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [executionRunRow({
          id: 'run-live',
          user_id: 'user-1',
          config: { accountId: 'ACC-1' },
          market_data_snapshot: { accountIdentifier: 'ACC-2' }
        })]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'account-1',
          user_id: 'user-1',
          account_name: 'Primary Sim',
          account_identifier: 'ACC-1',
          broker: 'IBKR',
          is_primary: true,
          trade_count: 14
        }]
      });

    const scope = await ExecutionRun.listShareScopeAccounts('user-1', 'run-live');

    expect(db.query.mock.calls[0][0]).toContain('WHERE id = $1 AND user_id = $2');
    expect(db.query.mock.calls[1][0]).toContain('ua.user_id = $1');
    expect(scope.accounts).toEqual([expect.objectContaining({
      id: 'account-1',
      accountIdentifier: 'ACC-1',
      scopeId: 'ACC-1',
      tradeCount: 14
    })]);
    expect(scope.unresolvedAccountIds).toEqual(['ACC-2']);
  });

  test('upserts editable report templates with normalized section and share defaults', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        template_key: 'investor',
        label: 'Investor IC Packet',
        description: 'Investor-ready report',
        sections: [{ key: 'overview', label: 'Overview', enabled: true }],
        share_defaults: { formats: ['json'], includeEvents: false },
        is_enabled: true,
        updated_by: 'admin-1'
      }]
    });

    const template = await ExecutionRun.upsertReportTemplate('investor', {
      label: 'Investor IC Packet',
      description: 'Investor-ready report',
      sections: [{ key: 'overview', label: 'Overview' }],
      shareDefaults: { formats: ['json'], includeEvents: false }
    }, 'admin-1');

    expect(db.query.mock.calls[0][0]).toContain('INSERT INTO execution_report_templates');
    expect(JSON.parse(db.query.mock.calls[0][1][3])).toEqual([{ key: 'overview', label: 'Overview', enabled: true }]);
    expect(template.templateKey).toBe('investor');
  });

  test('requests and applies report template revisions with diff metadata', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          template_key: 'trader',
          label: 'Trader Workbook',
          description: 'Old template',
          sections: [{ key: 'overview', label: 'Overview', enabled: true }],
          share_defaults: { formats: ['json', 'pdf'] },
          is_enabled: true
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'revision-1',
          template_key: 'trader',
          requested_by: 'admin-1',
          before_template: { label: 'Trader Workbook', sections: [{ key: 'overview', label: 'Overview', enabled: true }], shareDefaults: { formats: ['json', 'pdf'] }, isEnabled: true },
          after_template: { templateKey: 'trader', label: 'Trader Desk', description: 'New template', sections: [{ key: 'overview', label: 'Overview', enabled: true }, { key: 'events', label: 'Events', enabled: true }], shareDefaults: { formats: ['json'], template: 'trader' }, isEnabled: true },
          diff_summary: { changedFields: ['label', 'description'], addedSections: ['events'] },
          approval_status: 'pending'
        }]
      });

    const revision = await ExecutionRun.requestReportTemplateUpdate('trader', {
      label: 'Trader Desk',
      description: 'New template',
      sections: [
        { key: 'overview', label: 'Overview' },
        { key: 'events', label: 'Events' }
      ],
      shareDefaults: { formats: ['json'] }
    }, 'admin-1');

    expect(db.query.mock.calls[1][0]).toContain('INSERT INTO execution_report_template_revisions');
    expect(JSON.parse(db.query.mock.calls[1][1][4]).addedSections).toEqual(['events']);
    expect(revision.approvalStatus).toBe('pending');
  });

  test('requires a different reviewer for production report template approvals', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'revision-1',
          template_key: 'trader',
          requested_by: 'admin-1',
          before_template: {},
          after_template: { templateKey: 'trader', label: 'Trader Desk', sections: [], shareDefaults: {} },
          diff_summary: {},
          approval_status: 'pending'
        }]
      });

      await expect(
        ExecutionRun.runReportTemplateRevisionAction('revision-1', 'approve', 'admin-1')
      ).rejects.toThrow('requires a different reviewer');
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test('allows a separate production reviewer to reject report template revisions', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'revision-1',
            template_key: 'trader',
            requested_by: 'admin-1',
            before_template: {},
            after_template: { templateKey: 'trader', label: 'Trader Desk', sections: [], shareDefaults: {} },
            diff_summary: {},
            approval_status: 'pending'
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'revision-1',
            template_key: 'trader',
            requested_by: 'admin-1',
            reviewed_by: 'admin-2',
            before_template: {},
            after_template: { templateKey: 'trader', label: 'Trader Desk', sections: [], shareDefaults: {} },
            diff_summary: {},
            approval_status: 'rejected'
          }]
        });

      const result = await ExecutionRun.runReportTemplateRevisionAction('revision-1', 'reject', 'admin-2');

      expect(db.query.mock.calls[1][0]).toContain("approval_status = 'rejected'");
      expect(result.revision).toMatchObject({
        approvalStatus: 'rejected',
        reviewedBy: 'admin-2'
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test('repairs legacy event hashes in deterministic chain order', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [
          { id: 'event-1', run_id: 'run-1', event_type: 'run.created', payload: {}, previous_event_hash: null, event_hash: null, created_at: '2026-05-11T13:30:00.000Z' },
          { id: 'event-2', run_id: 'run-1', event_type: 'run.updated', payload: { field: 'metrics' }, previous_event_hash: null, event_hash: null, created_at: '2026-05-11T13:31:00.000Z' }
        ]
      })
      .mockResolvedValue({ rows: [] });

    const result = await ExecutionRun.backfillEventHashes({ runId: 'run-1', limit: 10 });

    expect(db.query.mock.calls[0][0]).toContain('FROM execution_run_events');
    expect(db.query.mock.calls[1][0]).toContain('UPDATE execution_run_events');
    expect(db.query.mock.calls[2][0]).toContain('UPDATE execution_run_events');
    expect(result).toMatchObject({ checkedEvents: 2, updatedEvents: 2 });
  });

  test('detects a corrupted execution-event fixture as a tamper violation', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'run-1',
          user_id: 'user-1',
          name: 'Tamper drill run',
          mode: 'backtest',
          source: 'trade-management',
          event_count: 1
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'event-1',
          run_id: 'run-1',
          event_type: 'run.created',
          payload: {},
          previous_event_hash: null,
          event_hash: 'corrupted-fixture-hash',
          created_at: '2026-05-11T13:30:00.000Z'
        }]
      });

    const violations = await ExecutionRun.findEventChainViolations({ limit: 10 });

    expect(violations).toEqual([expect.objectContaining({
      runId: 'run-1',
      verification: expect.objectContaining({ valid: false })
    })]);
  });
});
