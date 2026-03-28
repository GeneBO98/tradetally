jest.mock('../../src/services/billingService', () => ({}));
jest.mock('../../src/services/tierService', () => ({
  setUserTier: jest.fn()
}));
jest.mock('../../src/models/User', () => ({}));
jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/utils/appleIapVerification', () => ({
  AppleTransactionVerificationError: class AppleTransactionVerificationError extends Error {
    constructor(message, statusCode = 400) {
      super(message);
      this.statusCode = statusCode;
    }
  },
  verifyAppleSignedTransaction: jest.fn()
}));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');
const { verifyAppleSignedTransaction, AppleTransactionVerificationError } = require('../../src/utils/appleIapVerification');
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

describe('billing controller Apple verification', () => {
  let consoleErrorSpy;

  beforeAll(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('does not grant access based on client-supplied Xcode environment', async () => {
    db.query.mockResolvedValueOnce({ rows: [] });
    verifyAppleSignedTransaction.mockRejectedValue(new AppleTransactionVerificationError('invalid signed transaction'));

    const req = {
      user: { id: 'user-1' },
      body: {
        transaction_id: 'txn-1',
        product_id: 'com.tradetally.pro.monthly',
        receipt_data: 'signed-jws',
        environment: 'Xcode'
      }
    };
    const res = createResponse();
    const next = jest.fn();

    await billingController.verifyAppleReceipt(req, res, next);

    expect(TierService.setUserTier).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.payload).toEqual(expect.objectContaining({
      success: false,
      error: 'verification_failed'
    }));
  });
});
