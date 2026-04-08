jest.mock('../../src/services/billingService', () => ({
  cancelSubscription: jest.fn(),
  reactivateSubscription: jest.fn()
}));
jest.mock('../../src/services/tierService', () => ({}));
jest.mock('../../src/models/User', () => ({}));
jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/utils/appleIapVerification', () => ({
  AppleTransactionVerificationError: class extends Error {},
  verifyAppleSignedTransaction: jest.fn()
}));

const BillingService = require('../../src/services/billingService');
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

describe('billing controller cancel/reactivate', () => {
  let consoleLogSpy, consoleErrorSpy;
  const validCancelBody = {
    cancellationReason: 'too_expensive',
    feedbackText: 'Need to reduce costs for now.'
  };

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

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      const mockResult = {
        id: 'sub_123',
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: new Date('2026-04-28')
      };
      BillingService.cancelSubscription.mockResolvedValue(mockResult);

      const req = { user: { id: 'user-1' }, body: validCancelBody };
      const res = createResponse();
      const next = jest.fn();

      await billingController.cancelSubscription(req, res, next);

      expect(BillingService.cancelSubscription).toHaveBeenCalledWith('user-1', {
        cancellationReason: 'too_expensive',
        feedbackText: 'Need to reduce costs for now.'
      });
      expect(res.payload.success).toBe(true);
      expect(res.payload.data.cancel_at_period_end).toBe(true);
    });

    it('should return 400 when no active subscription', async () => {
      BillingService.cancelSubscription.mockRejectedValue(
        new Error('No active subscription found')
      );

      const req = { user: { id: 'user-1' }, body: validCancelBody };
      const res = createResponse();
      const next = jest.fn();

      await billingController.cancelSubscription(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.payload.error).toBe('invalid_subscription');
    });

    it('should return 400 when subscription is not active', async () => {
      BillingService.cancelSubscription.mockRejectedValue(
        new Error('Subscription is not active')
      );

      const req = { user: { id: 'user-1' }, body: validCancelBody };
      const res = createResponse();
      const next = jest.fn();

      await billingController.cancelSubscription(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.payload.error).toBe('invalid_subscription');
    });

    it('should return 400 when billing is not available', async () => {
      BillingService.cancelSubscription.mockRejectedValue(
        new Error('Billing not available')
      );

      const req = { user: { id: 'user-1' }, body: validCancelBody };
      const res = createResponse();
      const next = jest.fn();

      await billingController.cancelSubscription(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.payload.error).toBe('billing_unavailable');
    });

    it('should call next for unexpected errors', async () => {
      const unexpectedError = new Error('Stripe API down');
      BillingService.cancelSubscription.mockRejectedValue(unexpectedError);

      const req = { user: { id: 'user-1' }, body: validCancelBody };
      const res = createResponse();
      const next = jest.fn();

      await billingController.cancelSubscription(req, res, next);

      expect(next).toHaveBeenCalledWith(unexpectedError);
    });

    it('should return 400 when cancellation reason is invalid', async () => {
      const req = {
        user: { id: 'user-1' },
        body: { cancellationReason: 'invalid_reason' }
      };
      const res = createResponse();
      const next = jest.fn();

      await billingController.cancelSubscription(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.payload.error).toBe('invalid_cancellation_reason');
      expect(BillingService.cancelSubscription).not.toHaveBeenCalled();
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('reactivateSubscription', () => {
    it('should reactivate subscription successfully', async () => {
      const mockResult = {
        id: 'sub_123',
        status: 'active',
        cancel_at_period_end: false
      };
      BillingService.reactivateSubscription.mockResolvedValue(mockResult);

      const req = { user: { id: 'user-1' } };
      const res = createResponse();
      const next = jest.fn();

      await billingController.reactivateSubscription(req, res, next);

      expect(BillingService.reactivateSubscription).toHaveBeenCalledWith('user-1');
      expect(res.payload.success).toBe(true);
      expect(res.payload.data.cancel_at_period_end).toBe(false);
    });

    it('should return 400 when no subscription found', async () => {
      BillingService.reactivateSubscription.mockRejectedValue(
        new Error('No subscription found')
      );

      const req = { user: { id: 'user-1' } };
      const res = createResponse();
      const next = jest.fn();

      await billingController.reactivateSubscription(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.payload.error).toBe('invalid_subscription');
    });

    it('should return 400 when subscription is not set to cancel', async () => {
      BillingService.reactivateSubscription.mockRejectedValue(
        new Error('Subscription is not set to cancel')
      );

      const req = { user: { id: 'user-1' } };
      const res = createResponse();
      const next = jest.fn();

      await billingController.reactivateSubscription(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.payload.error).toBe('invalid_subscription');
    });

    it('should return 400 when billing is not available', async () => {
      BillingService.reactivateSubscription.mockRejectedValue(
        new Error('Billing not available')
      );

      const req = { user: { id: 'user-1' } };
      const res = createResponse();
      const next = jest.fn();

      await billingController.reactivateSubscription(req, res, next);

      expect(res.statusCode).toBe(400);
      expect(res.payload.error).toBe('billing_unavailable');
    });

    it('should call next for unexpected errors', async () => {
      const unexpectedError = new Error('Network timeout');
      BillingService.reactivateSubscription.mockRejectedValue(unexpectedError);

      const req = { user: { id: 'user-1' } };
      const res = createResponse();
      const next = jest.fn();

      await billingController.reactivateSubscription(req, res, next);

      expect(next).toHaveBeenCalledWith(unexpectedError);
    });
  });
});
