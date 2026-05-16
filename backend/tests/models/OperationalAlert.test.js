jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const db = require('../../src/config/database');
const OperationalAlert = require('../../src/models/OperationalAlert');

describe('OperationalAlert model', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('upserts an active alert by alert and entity identity', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'alert-1',
        alert_type: 'broker_sync_lease_expired',
        severity: 'critical',
        status: 'active',
        entity_type: 'broker_connection',
        entity_id: 'connection-1',
        message: 'Lease expired',
        payload: { leaseAgeSeconds: 3600 },
        first_seen_at: '2026-05-11T13:30:00.000Z',
        last_seen_at: '2026-05-11T13:35:00.000Z',
        resolved_at: null
      }]
    });

    const alert = await OperationalAlert.upsertActive({
      alertType: 'broker_sync_lease_expired',
      severity: 'critical',
      entityType: 'broker_connection',
      entityId: 'connection-1',
      message: 'Lease expired',
      payload: { leaseAgeSeconds: 3600 }
    });

    expect(db.query.mock.calls[0][0]).toContain('ON CONFLICT (alert_type, entity_type, entity_id)');
    expect(db.query.mock.calls[0][1][0]).toBe('broker_sync_lease_expired');
    expect(alert).toMatchObject({
      id: 'alert-1',
      alertType: 'broker_sync_lease_expired',
      severity: 'critical',
      status: 'active'
    });
  });

  test('resolves alerts for entities no longer reported as active', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'alert-2',
        alert_type: 'broker_sync_lease_expired',
        severity: 'critical',
        status: 'resolved',
        entity_type: 'broker_connection',
        entity_id: 'connection-2',
        message: 'Lease expired',
        payload: {},
        first_seen_at: '2026-05-11T13:30:00.000Z',
        last_seen_at: '2026-05-11T13:40:00.000Z',
        resolved_at: '2026-05-11T13:40:00.000Z'
      }]
    });

    const resolved = await OperationalAlert.resolveMissing(
      'broker_sync_lease_expired',
      'broker_connection',
      ['connection-1']
    );

    expect(db.query.mock.calls[0][0]).toContain('entity_id <> ALL($3::uuid[])');
    expect(db.query.mock.calls[0][1]).toEqual(['broker_sync_lease_expired', 'broker_connection', ['connection-1']]);
    expect(resolved[0].status).toBe('resolved');
  });

  test('records and lists alert action audits', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'audit-1',
          alert_id: 'alert-1',
          alert_type: 'broker_sync_lease_expired',
          entity_type: 'broker_connection',
          entity_id: 'connection-1',
          action: 'release_lease',
          actor_user_id: 'admin-1',
          status_before: 'active',
          status_after: 'resolved',
          payload: { resolvedAt: '2026-05-11T14:00:00.000Z' },
          created_at: '2026-05-11T14:00:00.000Z'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'audit-1',
          alert_id: 'alert-1',
          alert_type: 'broker_sync_lease_expired',
          entity_type: 'broker_connection',
          entity_id: 'connection-1',
          action: 'release_lease',
          actor_user_id: 'admin-1',
          actor_email: 'admin@example.com',
          actor_username: 'admin',
          status_before: 'active',
          status_after: 'resolved',
          payload: { resolvedAt: '2026-05-11T14:00:00.000Z' },
          created_at: '2026-05-11T14:00:00.000Z'
        }]
      });

    const audit = await OperationalAlert.recordActionAudit({
      id: 'alert-1',
      alertType: 'broker_sync_lease_expired',
      entityType: 'broker_connection',
      entityId: 'connection-1',
      status: 'active'
    }, {
      action: 'release_lease',
      actorUserId: 'admin-1',
      statusAfter: 'resolved',
      payload: { resolvedAt: '2026-05-11T14:00:00.000Z' }
    });
    const audits = await OperationalAlert.listActionAudits({ alertType: 'broker_sync_lease_expired' });

    expect(db.query.mock.calls[0][0]).toContain('INSERT INTO operational_alert_action_audits');
    expect(audit.action).toBe('release_lease');
    expect(db.query.mock.calls[1][0]).toContain('LEFT JOIN users');
    expect(audits[0]).toMatchObject({
      action: 'release_lease',
      actorEmail: 'admin@example.com',
      statusBefore: 'active',
      statusAfter: 'resolved'
    });
  });

  test('acknowledges and suppresses active alerts without resolving them', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'alert-3',
          alert_type: 'execution_report_access_anomaly',
          severity: 'warning',
          status: 'active',
          entity_type: 'execution_run',
          entity_id: 'run-1',
          message: 'High shared report access',
          payload: {},
          first_seen_at: '2026-05-11T13:30:00.000Z',
          last_seen_at: '2026-05-11T13:40:00.000Z',
          resolved_at: null,
          acknowledged_at: '2026-05-11T13:41:00.000Z',
          acknowledged_by: 'admin-1'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'alert-3',
          alert_type: 'execution_report_access_anomaly',
          severity: 'warning',
          status: 'active',
          entity_type: 'execution_run',
          entity_id: 'run-1',
          message: 'High shared report access',
          payload: {},
          first_seen_at: '2026-05-11T13:30:00.000Z',
          last_seen_at: '2026-05-11T13:42:00.000Z',
          resolved_at: null,
          suppressed_until: '2026-05-11T14:42:00.000Z',
          suppression_reason: 'Known investor review window',
          acknowledged_at: '2026-05-11T13:41:00.000Z',
          acknowledged_by: 'admin-1'
        }]
      });

    const acknowledged = await OperationalAlert.acknowledgeById('alert-3', 'admin-1');
    const suppressed = await OperationalAlert.suppressById('alert-3', {
      minutes: 60,
      reason: 'Known investor review window',
      actorUserId: 'admin-1'
    });

    expect(db.query.mock.calls[0][0]).toContain('acknowledged_at = CURRENT_TIMESTAMP');
    expect(acknowledged.status).toBe('active');
    expect(db.query.mock.calls[1][0]).toContain('suppressed_until = CURRENT_TIMESTAMP');
    expect(suppressed.suppressionReason).toBe('Known investor review window');
  });

  test('records escalation delivery attempts for alert destinations', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'delivery-1',
        alert_id: 'alert-1',
        destination_id: 'destination-1',
        destination_type: 'email',
        target: 'ops@example.com',
        severity: 'critical',
        status: 'skipped',
        dry_run: true,
        payload: { alertType: 'execution_report_access_anomaly' },
        response_status: null,
        error_message: 'Delivery disabled',
        attempted_at: '2026-05-11T14:00:00.000Z',
        delivered_at: null,
        created_at: '2026-05-11T14:00:00.000Z'
      }]
    });

    const delivery = await OperationalAlert.recordEscalationDelivery({
      alertId: 'alert-1',
      destinationId: 'destination-1',
      destinationType: 'email',
      target: 'ops@example.com',
      severity: 'critical',
      status: 'skipped',
      dryRun: true,
      payload: { alertType: 'execution_report_access_anomaly' },
      errorMessage: 'Delivery disabled'
    });

    expect(db.query.mock.calls[0][0]).toContain('INSERT INTO operational_alert_escalation_deliveries');
    expect(delivery).toMatchObject({
      id: 'delivery-1',
      status: 'skipped',
      dryRun: true,
      target: 'ops@example.com'
    });
  });

  test('claims retry deliveries with leases and skips dead-lettered rows', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'delivery-lease-1',
        alert_id: 'alert-1',
        destination_id: 'destination-1',
        destination_type: 'webhook',
        target: 'https://example.test/hook',
        severity: 'warning',
        status: 'failed',
        dry_run: false,
        payload: {},
        retry_count: 2,
        next_retry_at: '2026-05-11T14:00:00.000Z',
        retry_lease_id: 'lease-1',
        retry_lease_until: '2026-05-11T14:05:00.000Z'
      }]
    });

    const deliveries = await OperationalAlert.claimDueEscalationRetryDeliveries({ limit: 5, includeSkipped: true });

    expect(db.query.mock.calls[0][0]).toContain('FOR UPDATE SKIP LOCKED');
    expect(db.query.mock.calls[0][0]).toContain('dead_lettered_at IS NULL');
    expect(deliveries[0]).toMatchObject({
      id: 'delivery-lease-1',
      retryLeaseId: 'lease-1'
    });
  });

  test('creates escalation destination change requests for approval', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'destination-1',
          destination_type: 'email',
          target: 'ops@example.com',
          severity: 'warning',
          is_enabled: true,
          metadata: {}
        }]
      })
      .mockResolvedValueOnce({
        rows: [{
          id: 'request-1',
          destination_id: 'destination-1',
          action: 'disable',
          status: 'pending',
          requested_by: 'admin-1',
          reason: 'Maintenance window',
          before_state: { id: 'destination-1', isEnabled: true },
          after_state: { id: 'destination-1', isEnabled: false },
          requested_at: '2026-05-11T14:00:00.000Z'
        }]
      });

    const request = await OperationalAlert.requestEscalationDestinationChange({
      destinationId: 'destination-1',
      action: 'disable',
      reason: 'Maintenance window'
    }, 'admin-1');

    expect(db.query.mock.calls[1][0]).toContain('INSERT INTO operational_alert_escalation_destination_change_requests');
    expect(request).toMatchObject({
      action: 'disable',
      status: 'pending',
      reason: 'Maintenance window'
    });
  });

  test('requires a different reviewer for production destination approvals', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      db.query.mockResolvedValueOnce({
        rows: [{
          id: 'request-1',
          destination_id: 'destination-1',
          action: 'disable',
          status: 'pending',
          requested_by: 'admin-1',
          reason: 'Maintenance window',
          before_state: { id: 'destination-1', isEnabled: true },
          after_state: { id: 'destination-1', isEnabled: false }
        }]
      });

      await expect(
        OperationalAlert.runEscalationDestinationChangeRequestAction('request-1', 'approve', 'admin-1')
      ).rejects.toThrow('requires a different reviewer');
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test('creates scoped dead-letter replay requests with retry limits', async () => {
    db.query
      .mockResolvedValueOnce({
        rows: [{
          id: 'delivery-1',
          alert_id: 'alert-1',
          destination_id: 'destination-1',
          destination_type: 'webhook',
          target: 'https://example.test/hook',
          severity: 'critical',
          status: 'failed',
          dry_run: false,
          payload: {},
          retry_count: 5,
          dead_lettered_at: '2026-05-11T14:00:00.000Z',
          dead_letter_reason: 'Max retries reached'
        }]
      })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({
        rows: [{
          id: 'replay-request-1',
          delivery_id: 'delivery-1',
          status: 'pending',
          requested_by: 'admin-1',
          reason: 'Provider outage recovered',
          scope: {
            maxReplayCount: 3,
            replayCount: 1,
            destinationType: 'webhook',
            target: 'https://example.test/hook'
          },
          requested_at: '2026-05-11T15:00:00.000Z'
        }]
      });

    const request = await OperationalAlert.requestEscalationDeliveryReplay('delivery-1', {
      reason: 'Provider outage recovered',
      maxReplayCount: 3
    }, 'admin-1');

    expect(db.query.mock.calls[2][0]).toContain('INSERT INTO operational_alert_delivery_replay_requests');
    expect(request).toMatchObject({
      id: 'replay-request-1',
      status: 'pending',
      scope: {
        maxReplayCount: 3,
        replayCount: 1,
        destinationType: 'webhook'
      }
    });
  });

  test('filters dead-letter replay requests by status destination and date', async () => {
    db.query.mockResolvedValueOnce({
      rows: [{
        id: 'replay-request-1',
        delivery_id: 'delivery-1',
        status: 'pending',
        requested_by: 'admin-1',
        reason: 'Provider recovered',
        review_note: null,
        scope: { destinationType: 'webhook' },
        destination_type: 'webhook',
        target: 'https://example.test/hook',
        requested_at: '2026-05-11T15:00:00.000Z'
      }]
    });

    const requests = await OperationalAlert.listEscalationDeliveryReplayRequests({
      status: 'pending',
      destinationType: 'webhook',
      from: '2026-05-11',
      to: '2026-05-12'
    });

    expect(db.query.mock.calls[0][0]).toContain('LEFT JOIN operational_alert_escalation_deliveries');
    expect(db.query.mock.calls[0][0]).toContain('d.destination_type');
    expect(db.query.mock.calls[0][1]).toEqual(['pending', 'webhook', '2026-05-11', '2026-05-12', 50]);
    expect(requests[0]).toMatchObject({
      destinationType: 'webhook',
      target: 'https://example.test/hook'
    });
  });

  test('allows a separate production reviewer to reject replay requests with an audit note', async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      db.query
        .mockResolvedValueOnce({
          rows: [{
            id: 'replay-request-1',
            delivery_id: 'delivery-1',
            status: 'pending',
            requested_by: 'admin-1',
            reason: 'Provider recovered',
            scope: {}
          }]
        })
        .mockResolvedValueOnce({
          rows: [{
            id: 'replay-request-1',
            delivery_id: 'delivery-1',
            status: 'rejected',
            requested_by: 'admin-1',
            reviewed_by: 'admin-2',
            reason: 'Provider recovered',
            review_note: 'Rejected by second reviewer',
            scope: {}
          }]
        });

      const request = await OperationalAlert.rejectEscalationDeliveryReplayRequest(
        'replay-request-1',
        'admin-2',
        'Rejected by second reviewer'
      );

      expect(db.query.mock.calls[1][0]).toContain('review_note = $3');
      expect(request).toMatchObject({
        status: 'rejected',
        reviewedBy: 'admin-2',
        reviewNote: 'Rejected by second reviewer'
      });
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }
  });

  test('dry-runs replay request cleanup before expiring stale pending rows', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ count: 2 }] })
      .mockResolvedValueOnce({ rows: [{ count: 3 }] });

    const result = await OperationalAlert.cleanupEscalationDeliveryReplayRequests({
      pendingOlderThanHours: 24,
      reviewedOlderThanDays: 30,
      dryRun: true
    });

    expect(db.query.mock.calls[0][0]).toContain("status = 'pending'");
    expect(db.query.mock.calls[1][0]).toContain("status IN ('applied', 'rejected')");
    expect(result).toMatchObject({
      dryRun: true,
      stalePending: 2,
      oldReviewed: 3,
      expiredPending: 0,
      deletedReviewed: 0
    });
  });
});
