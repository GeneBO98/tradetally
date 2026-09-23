// The Host header is client controlled. On tradetally.io it must not be able
// to switch billing off (which would unlock every Pro gate that passes it).

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/User', () => ({}));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');

describe('TierService.isBillingEnabled host handling', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.BILLING_ENABLED;
    TierService._billingEnvOverride = undefined;
    TierService._billingDbCache = null;
    db.query.mockResolvedValue({ rows: [{ value: true }] });
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    TierService._billingEnvOverride = undefined;
    TierService._billingDbCache = null;
    jest.restoreAllMocks();
  });

  test('a spoofed Host cannot disable billing on the hosted instance', async () => {
    process.env.FRONTEND_URL = 'https://tradetally.io';
    await expect(TierService.isBillingEnabled('evil.example.com')).resolves.toBe(true);
  });

  test('self-hosted FRONTEND_URL still disables billing', async () => {
    process.env.FRONTEND_URL = 'https://journal.example.com';
    await expect(TierService.isBillingEnabled('journal.example.com')).resolves.toBe(false);
  });

  test('falls back to the Host header when FRONTEND_URL is not set', async () => {
    delete process.env.FRONTEND_URL;
    await expect(TierService.isBillingEnabled('localhost:3000')).resolves.toBe(false);
  });
});
