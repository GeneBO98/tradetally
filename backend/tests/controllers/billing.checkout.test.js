jest.mock('../../src/services/billingService', () => ({
  getPricingPlans: jest.fn(),
  getPricingExperiments: jest.fn(),
  createCheckoutSession: jest.fn()
}));
jest.mock('../../src/services/tierService', () => ({
  isBillingEnabled: jest.fn()
}));
jest.mock('../../src/models/User', () => ({}));
jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/utils/appleIapVerification', () => ({
  AppleTransactionVerificationError: class extends Error {},
  verifyAppleSignedTransaction: jest.fn()
}));

const BillingService = require('../../src/services/billingService');
const TierService = require('../../src/services/tierService');
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

describe('billing controller checkout and pricing experiments', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  const originalFrontendUrl = process.env.FRONTEND_URL;

  beforeAll(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    process.env.FRONTEND_URL = originalFrontendUrl;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FRONTEND_URL = 'https://app.tradetally.test';
  });

  it('returns pricing experiment metadata alongside plans', async () => {
    const plans = [
      { id: 'price_monthly', interval: 'month', price: 800, currency: 'USD' }
    ];
    const experiments = {
      pricing_monthly_offer: {
        control: { id: 'price_monthly', interval: 'month', price: 800, currency: 'USD' },
        higher_price: { id: 'price_monthly_high', interval: 'month', price: 1200, currency: 'USD' }
      }
    };

    TierService.isBillingEnabled.mockResolvedValue(true);
    BillingService.isBillingAvailable = jest.fn().mockResolvedValue(true);
    BillingService.getPricingPlans.mockResolvedValue(plans);
    BillingService.getPricingExperiments.mockResolvedValue(experiments);

    const req = {
      headers: {
        host: 'tradetally.test',
        'user-agent': 'jest'
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await billingController.getPricingPlans(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.payload.success).toBe(true);
    expect(res.payload.data).toEqual(plans);
    expect(res.payload.experiments).toEqual(experiments);
  });

  it('passes pricing experiment metadata into checkout session creation', async () => {
    BillingService.createCheckoutSession.mockResolvedValue({
      id: 'cs_test_123',
      url: 'https://checkout.stripe.test/session'
    });

    const req = {
      user: { id: 'user-1' },
      body: {
        priceId: 'price_monthly_high',
        redirectUrl: '/dashboard',
        referral: 'partner-1',
        pricingExperiment: {
          key: 'pricing_monthly_offer',
          variant: 'higher_price',
          displayedPriceCents: 1200,
          currency: 'USD'
        }
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await billingController.createCheckoutSession(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(BillingService.createCheckoutSession).toHaveBeenCalledWith(
      'user-1',
      'price_monthly_high',
      'https://app.tradetally.test/billing?session_id={CHECKOUT_SESSION_ID}&redirect=%2Fdashboard',
      'https://app.tradetally.test/pricing',
      'partner-1',
      {
        key: 'pricing_monthly_offer',
        variant: 'higher_price',
        displayedPriceCents: 1200,
        currency: 'USD'
      }
    );
    expect(res.payload.data.checkout_url).toBe('https://checkout.stripe.test/session');
  });

  it('returns 400 when checkout uses an unapproved price id', async () => {
    const invalidPriceError = new Error('Price ID is not allowed');
    invalidPriceError.code = 'invalid_price_id';
    BillingService.createCheckoutSession.mockRejectedValue(invalidPriceError);

    const req = {
      user: { id: 'user-1' },
      body: {
        priceId: 'price_not_allowed'
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await billingController.createCheckoutSession(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual({
      error: 'invalid_price_id',
      message: 'The selected price is not available'
    });
  });
});
