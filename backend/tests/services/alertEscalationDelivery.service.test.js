jest.mock('../../src/models/OperationalAlert', () => ({
  recordEscalationDelivery: jest.fn(),
  findEscalationDeliveryById: jest.fn(),
  findEscalationDestinationById: jest.fn(),
  findById: jest.fn(),
  markEscalationDeliveryRetryClaimed: jest.fn(),
  markEscalationDeliveryDeadLettered: jest.fn(),
  claimDueEscalationRetryDeliveries: jest.fn(),
  listDueEscalationRetryDeliveries: jest.fn()
}));
jest.mock('../../src/services/emailService', () => ({
  isConfigured: jest.fn(() => false),
  createTransporter: jest.fn(),
  getBaseTemplate: jest.fn((title, body) => `${title}${body}`)
}));

const OperationalAlert = require('../../src/models/OperationalAlert');
const AlertEscalationDeliveryService = require('../../src/services/alertEscalationDeliveryService');

describe('AlertEscalationDeliveryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.ALERT_ESCALATION_DELIVERY_ENABLED;
    OperationalAlert.recordEscalationDelivery.mockImplementation(payload => Promise.resolve({
      id: 'delivery-1',
      ...payload
    }));
    OperationalAlert.markEscalationDeliveryRetryClaimed.mockImplementation(payload => Promise.resolve(payload));
    OperationalAlert.claimDueEscalationRetryDeliveries.mockResolvedValue([]);
  });

  test('records dry-run deliveries when escalation workers are disabled', async () => {
    const deliveries = await AlertEscalationDeliveryService.deliverAlerts([
      {
        id: 'alert-1',
        alertType: 'execution_report_access_anomaly',
        severity: 'critical',
        status: 'active',
        entityType: 'execution_run',
        entityId: 'run-1',
        message: 'High shared report access',
        payload: {}
      }
    ], [
      {
        id: 'destination-1',
        destinationType: 'email',
        target: 'ops@example.com',
        severity: 'warning',
        isEnabled: true,
        metadata: {}
      }
    ]);

    expect(OperationalAlert.recordEscalationDelivery).toHaveBeenCalledWith(expect.objectContaining({
      alertId: 'alert-1',
      destinationId: 'destination-1',
      status: 'skipped',
      dryRun: true
    }));
    expect(deliveries[0].payload.alertType).toBe('execution_report_access_anomaly');
  });

  test('does not deliver lower-severity alerts to critical-only destinations', async () => {
    const deliveries = await AlertEscalationDeliveryService.deliverAlerts([
      { id: 'alert-2', alertType: 'info_alert', severity: 'info', status: 'active', message: 'FYI' }
    ], [
      { id: 'destination-2', destinationType: 'webhook', target: 'https://example.test/hook', severity: 'critical', isEnabled: true }
    ]);

    expect(deliveries).toEqual([]);
    expect(OperationalAlert.recordEscalationDelivery).not.toHaveBeenCalled();
  });

  test('retries failed deliveries with incremented retry metadata', async () => {
    OperationalAlert.findEscalationDeliveryById.mockResolvedValue({
      id: 'delivery-1',
      alertId: 'alert-1',
      destinationId: 'destination-1',
      destinationType: 'webhook',
      target: 'https://example.test/hook',
      severity: 'critical',
      status: 'failed',
      retryCount: 1,
      payload: {
        alertId: 'alert-1',
        alertType: 'execution_event_chain_tamper',
        severity: 'critical',
        status: 'active',
        message: 'Event chain failed'
      }
    });
    OperationalAlert.findEscalationDestinationById.mockResolvedValue({
      id: 'destination-1',
      destinationType: 'webhook',
      target: 'https://example.test/hook',
      severity: 'warning',
      isEnabled: true,
      metadata: {}
    });
    OperationalAlert.findById.mockResolvedValue({
      id: 'alert-1',
      alertType: 'execution_event_chain_tamper',
      severity: 'critical',
      status: 'active',
      message: 'Event chain failed'
    });

    const delivery = await AlertEscalationDeliveryService.retryDelivery('delivery-1', 'admin-1');

    expect(OperationalAlert.recordEscalationDelivery).toHaveBeenCalledWith(expect.objectContaining({
      destinationId: 'destination-1',
      status: 'skipped',
      dryRun: true,
      retryCount: 2
    }));
    expect(OperationalAlert.markEscalationDeliveryRetryClaimed).toHaveBeenCalledWith('delivery-1', expect.objectContaining({
      reason: expect.stringContaining('Retry requested')
    }));
    expect(delivery.retryCount).toBe(2);
  });

  test('processes due retry deliveries from the durable retry queue', async () => {
    const dueDelivery = {
      id: 'delivery-2',
      alertId: 'alert-2',
      destinationId: null,
      destinationType: 'webhook',
      target: 'https://example.test/hook',
      severity: 'warning',
      status: 'failed',
      retryCount: 0,
      payload: { alertId: 'alert-2', alertType: 'latency_alert', message: 'Slow report' }
    };
    OperationalAlert.claimDueEscalationRetryDeliveries.mockResolvedValue([dueDelivery]);
    OperationalAlert.findEscalationDeliveryById.mockResolvedValue(dueDelivery);
    OperationalAlert.findById.mockResolvedValue(null);

    const result = await AlertEscalationDeliveryService.processDueRetries({ limit: 10 });

    expect(OperationalAlert.claimDueEscalationRetryDeliveries).toHaveBeenCalledWith({ limit: 10, includeSkipped: false });
    expect(result.checked).toBe(1);
    expect(result.retried).toHaveLength(1);
  });
});
