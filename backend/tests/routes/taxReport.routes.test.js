// The report is open to every plan; only the file export is Pro-gated.
jest.mock('../../src/middleware/auth', () => ({
  authenticate: (req, res, next) => { req.user = { id: 'user-1' }; next(); }
}));
jest.mock('../../src/services/tierService', () => ({
  isBillingEnabled: jest.fn(),
  getUserTier: jest.fn()
}));
jest.mock('../../src/controllers/taxReport.controller', () => ({
  getReport: jest.fn((req, res) => res.json({ ok: 'report' })),
  exportReport: jest.fn((req, res) => res.send('file'))
}));

const express = require('express');
const request = require('supertest');
const TierService = require('../../src/services/tierService');
const controller = require('../../src/controllers/taxReport.controller');

const app = express();
app.use('/api/tax-report', require('../../src/routes/taxReport.routes'));

describe('tax report routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    TierService.isBillingEnabled.mockResolvedValue(true);
    TierService.getUserTier.mockResolvedValue('free');
  });

  it('serves the report to a free user', async () => {
    const res = await request(app).get('/api/tax-report?year=2025');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: 'report' });
  });

  it('refuses the export to a free user', async () => {
    const res = await request(app).get('/api/tax-report/export?year=2025&format=txf');

    expect(res.status).toBe(403);
    expect(res.body.requiredTier).toBe('pro');
    expect(controller.exportReport).not.toHaveBeenCalled();
  });

  it('serves the export to a Pro user and to self-hosted installs', async () => {
    TierService.getUserTier.mockResolvedValue('pro');
    expect((await request(app).get('/api/tax-report/export?year=2025')).status).toBe(200);

    TierService.getUserTier.mockResolvedValue('free');
    TierService.isBillingEnabled.mockResolvedValue(false);
    expect((await request(app).get('/api/tax-report/export?year=2025')).status).toBe(200);
  });
});
