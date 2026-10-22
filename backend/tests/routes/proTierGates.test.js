// Route-level Pro gates. Each listed endpoint must return the requiresTier
// 403 body for free users when billing is enabled, and pass through when
// billing is disabled (self-hosted installs, where everyone is Pro).

const stubController = () => new Proxy({}, {
  get: (_target, prop) => {
    if (prop === '__esModule') return false;
    return (req, res) => res.json({ ok: true, handler: String(prop) });
  }
});

jest.mock('../../src/middleware/auth', () => {
  const setUser = (req, _res, next) => {
    req.user = { id: 'user-1', role: 'user', is_active: true };
    next();
  };
  return {
    TOKEN_PURPOSES: { ACCESS: 'access' },
    authenticate: setUser,
    authenticateWidget: setUser,
    optionalAuth: setUser,
    requireAdmin: (_req, _res, next) => next(),
    verifyJwtToken: jest.fn(),
    isTokenSessionValid: jest.fn(),
    findActiveUserForAuth: jest.fn(),
    generateToken: jest.fn(),
    generateWidgetToken: jest.fn(),
    extractAccessToken: jest.fn(),
    clearAuthUserCache: jest.fn()
  };
});
jest.mock('../../src/middleware/csrf', () => ({ requireCsrf: (_req, _res, next) => next() }));
jest.mock('../../src/services/tierService', () => ({
  isBillingEnabled: jest.fn(),
  getUserTier: jest.fn(),
  hasFeatureAccess: jest.fn()
}));
jest.mock('../../src/controllers/analytics.controller', () => stubController());
jest.mock('../../src/controllers/equity.controller', () => stubController());
jest.mock('../../src/controllers/diary.controller', () => stubController());
jest.mock('../../src/controllers/edgeReport.controller', () => stubController());
jest.mock('../../src/controllers/gamification.controller', () => stubController());
jest.mock('../../src/controllers/trade.controller', () => stubController());
jest.mock('../../src/controllers/newsEnrichment.controller', () => stubController());
jest.mock('../../src/controllers/oauth2.controller', () => stubController());
jest.mock('../../src/controllers/account.controller', () => stubController());
jest.mock('../../src/controllers/plaid.controller', () => stubController());

const express = require('express');
const request = require('supertest');
const TierService = require('../../src/services/tierService');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/analytics', require('../../src/routes/analytics.routes'));
  app.use('/api/equity', require('../../src/routes/equity.routes'));
  app.use('/api/diary', require('../../src/routes/diary.routes'));
  app.use('/api/edge-reports', require('../../src/routes/edgeReport.routes'));
  app.use('/api/gamification', require('../../src/routes/gamification.routes'));
  app.use('/api/trades', require('../../src/routes/trade.routes'));
  app.use('/api/news-enrichment', require('../../src/routes/newsEnrichment.routes'));
  app.use('/api/oauth', require('../../src/routes/oauth2.routes'));
  app.use('/api/accounts', require('../../src/routes/account.routes'));
  return app;
}

const PRO_ROUTES = [
  ['get', '/api/analytics/maemfe'],
  ['get', '/api/analytics/maemfe/trades'],
  ['get', '/api/analytics/hours'],
  ['get', '/api/analytics/sectors'],
  ['get', '/api/analytics/sectors/available'],
  ['get', '/api/analytics/sectors/refresh'],
  ['post', '/api/analytics/categorize-symbols'],
  ['get', '/api/analytics/symbol-stats'],
  ['get', '/api/analytics/symbols'],
  ['get', '/api/analytics/strategies'],
  ['get', '/api/equity/k-ratio'],
  ['get', '/api/diary/analyze'],
  ['get', '/api/diary/analyze/req-1'],
  ['get', '/api/edge-reports'],
  ['get', '/api/edge-reports/latest'],
  ['post', '/api/edge-reports/generate'],
  ['get', '/api/gamification/peer-comparison'],
  ['post', '/api/gamification/challenges/c1/join'],
  ['get', '/api/gamification/challenges/c1/leaderboard'],
  ['get', '/api/trades/news'],
  ['post', '/api/trades/news/refresh'],
  ['get', '/api/trades/earnings'],
  ['post', '/api/trades/earnings/refresh'],
  ['put', '/api/trades/t1/health'],
  ['put', '/api/trades/health/bulk'],
  ['post', '/api/news-enrichment/backfill'],
  ['post', '/api/oauth/api/clients'],
  ['post', '/api/accounts/plaid/link-token'],
  ['post', '/api/accounts/plaid/exchange'],
  ['put', '/api/accounts/plaid/connections/c1'],
  ['post', '/api/accounts/plaid/connections/c1/sync'],
  ['post', '/api/accounts/plaid/connections/c1/reconnect-token'],
  ['put', '/api/accounts/plaid/accounts/p1/link'],
  ['post', '/api/accounts/a1/plaid/review/bulk-approve'],
  ['post', '/api/accounts/a1/plaid/review/tx1/approve']
];

// Endpoints that must stay open to free users.
const FREE_ROUTES = [
  ['get', '/api/analytics/overview'],
  ['get', '/api/analytics/charts'],
  ['get', '/api/analytics/export'],
  ['get', '/api/analytics/tags'],
  ['get', '/api/analytics/brokers/available'],
  ['get', '/api/equity/snapshots'],
  ['get', '/api/diary'],
  ['get', '/api/gamification/leaderboards'],
  ['get', '/api/oauth/api/clients'],
  ['delete', '/api/oauth/api/clients/c1'],
  ['get', '/api/accounts/plaid/connections'],
  ['get', '/api/accounts/plaid/balances/history'],
  ['delete', '/api/accounts/plaid/connections/c1'],
  ['delete', '/api/accounts/plaid/accounts/p1/link'],
  ['get', '/api/accounts/a1/plaid/review']
];

describe('Pro tier route gates', () => {
  let app;

  beforeAll(() => {
    app = buildApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('billing enabled, free user', () => {
    beforeEach(() => {
      TierService.isBillingEnabled.mockResolvedValue(true);
      TierService.getUserTier.mockResolvedValue('free');
    });

    test.each(PRO_ROUTES)('%s %s returns 403 Pro tier required', async (method, path) => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error: 'Pro tier required',
        message: expect.any(String),
        currentTier: 'free',
        requiredTier: 'pro'
      });
    });

    test.each(FREE_ROUTES)('%s %s stays available', async (method, path) => {
      const res = await request(app)[method](path).send({});
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  describe('billing enabled, Pro user', () => {
    beforeEach(() => {
      TierService.isBillingEnabled.mockResolvedValue(true);
      TierService.getUserTier.mockResolvedValue('pro');
    });

    test.each(PRO_ROUTES)('%s %s reaches the controller', async (method, path) => {
      const res = await request(app)[method](path).send({});
      expect(res.body.ok).toBe(true);
    });
  });

  describe('billing disabled (self-hosted)', () => {
    beforeEach(() => {
      TierService.isBillingEnabled.mockResolvedValue(false);
      TierService.getUserTier.mockResolvedValue('free');
    });

    test.each(PRO_ROUTES)('%s %s reaches the controller', async (method, path) => {
      const res = await request(app)[method](path).send({});
      expect(res.body.ok).toBe(true);
    });
  });
});
