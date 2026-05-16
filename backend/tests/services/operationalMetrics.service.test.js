jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

jest.mock('../../src/models/BrokerConnection', () => ({
  getSyncLeaseMetrics: jest.fn(),
  releaseSyncClaim: jest.fn()
}));

jest.mock('../../src/models/ExecutionRun', () => ({
  getWorkflowSettings: jest.fn(),
  findEventChainViolations: jest.fn()
}));

jest.mock('../../src/models/OperationalAlert', () => ({
  findById: jest.fn(),
  upsertActive: jest.fn(),
  resolveMissing: jest.fn(),
  resolveById: jest.fn(),
  acknowledgeById: jest.fn(),
  suppressById: jest.fn(),
  recordActionAudit: jest.fn()
}));

const db = require('../../src/config/database');
const BrokerConnection = require('../../src/models/BrokerConnection');
const ExecutionRun = require('../../src/models/ExecutionRun');
const OperationalAlert = require('../../src/models/OperationalAlert');
const OperationalMetricsService = require('../../src/services/operationalMetricsService');

describe('OperationalMetricsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('raises report access anomaly alerts from shared-link audit volume', async () => {
    ExecutionRun.getWorkflowSettings.mockResolvedValue({
      sharedReportAccessThreshold: 3,
      sharedReportAccessWindowMinutes: 10
    });
    db.query.mockResolvedValueOnce({
      rows: [{
        run_id: 'run-1',
        name: 'Shared backtest',
        mode: 'backtest',
        source: 'trade-management',
        access_count: 4,
        first_access_at: '2026-05-11T13:50:00.000Z',
        last_access_at: '2026-05-11T13:59:00.000Z',
        distinct_ip_count: 2,
        distinct_user_agent_count: 2
      }]
    });
    OperationalAlert.upsertActive.mockResolvedValue({ id: 'alert-1', alertType: 'execution_report_access_anomaly' });
    OperationalAlert.resolveMissing.mockResolvedValue([]);

    const result = await OperationalMetricsService.scanReportAccessAnomalyAlerts('trade-management');

    expect(db.query.mock.calls[0][0]).toContain('execution_run_report_accesses');
    expect(db.query.mock.calls[0][1]).toEqual([10, 3, 'trade-management']);
    expect(OperationalAlert.upsertActive).toHaveBeenCalledWith(expect.objectContaining({
      alertType: 'execution_report_access_anomaly',
      entityType: 'execution_run',
      entityId: 'run-1'
    }));
    expect(result.alerts).toHaveLength(1);
  });

  test('audits alert actions after resolving expired leases', async () => {
    OperationalAlert.findById.mockResolvedValue({
      id: 'alert-1',
      alertType: 'broker_sync_lease_expired',
      entityType: 'broker_connection',
      entityId: 'connection-1',
      status: 'active'
    });
    OperationalAlert.resolveById.mockResolvedValue({
      id: 'alert-1',
      alertType: 'broker_sync_lease_expired',
      status: 'resolved',
      resolvedAt: '2026-05-11T14:00:00.000Z'
    });
    OperationalAlert.recordActionAudit.mockResolvedValue({ id: 'audit-1', action: 'release_lease' });

    const result = await OperationalMetricsService.runAlertAction('alert-1', 'release_lease', 'admin-1');

    expect(BrokerConnection.releaseSyncClaim).toHaveBeenCalledWith('connection-1');
    expect(OperationalAlert.recordActionAudit).toHaveBeenCalledWith(expect.objectContaining({
      id: 'alert-1',
      status: 'active'
    }), expect.objectContaining({
      action: 'release_lease',
      actorUserId: 'admin-1',
      statusAfter: 'resolved'
    }));
    expect(result.audit.id).toBe('audit-1');
  });

  test('audits acknowledgement and suppression windows without resolving alerts', async () => {
    OperationalAlert.findById.mockResolvedValue({
      id: 'alert-2',
      alertType: 'execution_report_access_anomaly',
      entityType: 'execution_run',
      entityId: 'run-1',
      status: 'active'
    });
    OperationalAlert.suppressById.mockResolvedValue({
      id: 'alert-2',
      alertType: 'execution_report_access_anomaly',
      status: 'active',
      suppressedUntil: '2026-05-11T15:00:00.000Z',
      suppressionReason: 'Known investor review'
    });
    OperationalAlert.recordActionAudit.mockResolvedValue({ id: 'audit-2', action: 'suppress' });

    const result = await OperationalMetricsService.runAlertAction('alert-2', 'suppress', 'admin-1', {
      minutes: 90,
      reason: 'Known investor review'
    });

    expect(OperationalAlert.suppressById).toHaveBeenCalledWith('alert-2', expect.objectContaining({
      actorUserId: 'admin-1',
      minutes: 90,
      reason: 'Known investor review'
    }));
    expect(OperationalAlert.recordActionAudit).toHaveBeenCalledWith(expect.objectContaining({
      id: 'alert-2'
    }), expect.objectContaining({
      action: 'suppress',
      statusAfter: 'active'
    }));
    expect(result.audit.action).toBe('suppress');
  });

  test('raises tamper alerts when execution event-chain verification fails', async () => {
    ExecutionRun.findEventChainViolations.mockResolvedValue([{
      runId: 'run-1',
      name: 'Backtest audit',
      mode: 'backtest',
      source: 'trade-management',
      eventCount: 4,
      verification: { valid: false, checkedEventCount: 3, lastEventHash: 'hash-2' }
    }]);
    OperationalAlert.upsertActive.mockResolvedValue({ id: 'alert-3', alertType: 'execution_event_chain_tamper' });
    OperationalAlert.resolveMissing.mockResolvedValue([]);

    const result = await OperationalMetricsService.scanEventChainTamperAlerts();

    expect(OperationalAlert.upsertActive).toHaveBeenCalledWith(expect.objectContaining({
      alertType: 'execution_event_chain_tamper',
      severity: 'critical',
      entityType: 'execution_run',
      entityId: 'run-1'
    }));
    expect(result.violations).toHaveLength(1);
  });
});
