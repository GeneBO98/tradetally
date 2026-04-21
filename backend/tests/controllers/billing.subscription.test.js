jest.mock('../../src/services/billingService', () => ({
  getSubscriptionDetails: jest.fn()
}));
jest.mock('../../src/services/tierService', () => ({
  getUserTier: jest.fn()
}));
jest.mock('../../src/models/User', () => ({
  getTierOverride: jest.fn()
}));
jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/utils/appleIapVerification', () => ({
  AppleTransactionVerificationError: class extends Error {},
  verifyAppleSignedTransaction: jest.fn()
}));

const BillingService = require('../../src/services/billingService');
const TierService = require('../../src/services/tierService');
const User = require('../../src/models/User');
const billingController = require('../../src/controllers/billing.controller');

function createResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.payload = body;
      return this;
    }
  };
}

describe('billing controller subscription state', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeAll(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not report a paid subscriber as on trial when a stale trial override exists', async () => {
    BillingService.getSubscriptionDetails.mockResolvedValue({
      id: 'sub_123',
      status: 'active'
    });
    TierService.getUserTier.mockResolvedValue('pro');
    User.getTierOverride.mockResolvedValue({
      reason: 'Free 14-day trial',
      expires_at: '2026-04-30T00:00:00.000Z'
    });

    const req = {
      user: { id: 'user-1' },
      headers: {}
    };
    const res = createResponse();
    const next = jest.fn();

    await billingController.getSubscription(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.payload.success).toBe(true);
    expect(res.payload.data.subscription.status).toBe('active');
    expect(res.payload.data.isOnTrial).toBe(false);
    expect(res.payload.data.trialEndsAt).toBe(null);
    expect(res.payload.data.trial).toBe(null);
  });
});
