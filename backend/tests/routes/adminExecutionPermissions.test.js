const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');

jest.mock('../../src/models/User', () => ({
  findById: jest.fn()
}));
jest.mock('../../src/config/database', () => ({
  query: jest.fn(),
  connect: jest.fn()
}));
jest.mock('../../src/utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));

const User = require('../../src/models/User');
const adminRoutes = require('../../src/routes/admin.routes');

function appForAdminRoutes() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRoutes);
  app.use((err, req, res, next) => {
    res.status(err.status || 500).json({ error: err.message });
  });
  return app;
}

describe('admin execution endpoint row-level permissions', () => {
  let app;
  let token;

  beforeEach(() => {
    process.env.JWT_SECRET = 'permission-test-secret';
    app = appForAdminRoutes();
    token = jwt.sign({
      id: 'user-1',
      email: 'user@example.com',
      username: 'user',
      role: 'user',
      purpose: 'access'
    }, process.env.JWT_SECRET);
    User.findById.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'user',
      is_active: true
    });
  });

  test.each([
    ['get', '/api/admin/execution-runs'],
    ['get', '/api/admin/execution-runs/summary'],
    ['get', '/api/admin/execution-runs/00000000-0000-0000-0000-000000000001/report'],
    ['get', '/api/admin/observability/slo'],
    ['get', '/api/admin/alerts'],
    ['get', '/api/admin/alerts/audit'],
    ['get', '/api/admin/alerts/suppression-rules'],
    ['post', '/api/admin/alerts/suppression-rules'],
    ['get', '/api/admin/alerts/escalation-destinations'],
    ['post', '/api/admin/alerts/escalation-destinations'],
    ['get', '/api/admin/alerts/escalation-destinations/audits'],
    ['get', '/api/admin/alerts/escalation-destinations/requests'],
    ['post', '/api/admin/alerts/escalation-destinations/requests'],
    ['post', '/api/admin/alerts/escalation-destinations/requests/00000000-0000-0000-0000-000000000001/actions'],
    ['post', '/api/admin/alerts/escalation-destinations/00000000-0000-0000-0000-000000000001/actions'],
    ['get', '/api/admin/alerts/escalation-deliveries'],
    ['post', '/api/admin/alerts/escalation-deliveries/00000000-0000-0000-0000-000000000001/retry'],
    ['get', '/api/admin/alerts/escalation-delivery-replay-requests'],
    ['post', '/api/admin/alerts/escalation-deliveries/00000000-0000-0000-0000-000000000001/replay-requests'],
    ['post', '/api/admin/alerts/escalation-delivery-replay-requests/00000000-0000-0000-0000-000000000001/actions'],
    ['post', '/api/admin/alerts/scan'],
    ['post', '/api/admin/alerts/00000000-0000-0000-0000-000000000001/actions'],
    ['get', '/api/admin/import-account-reconciliations'],
    ['post', '/api/admin/import-account-reconciliations/bulk-actions'],
    ['post', '/api/admin/import-account-reconciliations/00000000-0000-0000-0000-000000000001/actions'],
    ['get', '/api/admin/import-account-reconciliation-audits'],
    ['post', '/api/admin/import-account-reconciliation-audits/00000000-0000-0000-0000-000000000001/rollback'],
    ['get', '/api/admin/report-templates'],
    ['get', '/api/admin/report-templates/revisions'],
    ['post', '/api/admin/report-templates/revisions/00000000-0000-0000-0000-000000000001/actions'],
    ['post', '/api/admin/report-templates/trader/revisions'],
    ['post', '/api/admin/report-templates/trader/preview'],
    ['post', '/api/admin/report-templates/trader'],
    ['post', '/api/admin/execution-runs/events/backfill-hashes'],
    ['get', '/api/admin/workflow-settings'],
    ['get', '/api/admin/workflow-settings/revisions'],
    ['post', '/api/admin/workflow-settings/trade-management/revisions'],
    ['post', '/api/admin/workflow-settings/revisions/00000000-0000-0000-0000-000000000001/actions'],
    ['patch', '/api/admin/workflow-settings/trade-management'],
    ['get', '/api/admin/strategy-anomaly-settings'],
    ['post', '/api/admin/strategy-anomaly-settings'],
    ['get', '/api/admin/performance-budgets'],
    ['get', '/api/admin/retention-policy'],
    ['get', '/api/admin/retention-policy/preview'],
    ['get', '/api/admin/retention-policy/revisions'],
    ['post', '/api/admin/retention-policy/revisions'],
    ['post', '/api/admin/retention-policy/revisions/00000000-0000-0000-0000-000000000001/actions'],
    ['post', '/api/admin/retention-policy/run']
  ])('%s %s rejects non-admin users before controller access', async (method, path) => {
    const response = await request(app)[method](path)
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Admin access required');
  });
});
