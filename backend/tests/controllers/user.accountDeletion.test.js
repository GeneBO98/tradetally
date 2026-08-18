jest.mock('../../src/models/User', () => ({
  findByEmail: jest.fn(),
  findByIdForAdmin: jest.fn(),
  verifyPassword: jest.fn(),
  getAdminCount: jest.fn(),
  deleteUser: jest.fn()
}));
jest.mock('../../src/services/billingService', () => ({
  cancelSubscriptionForAccountDeletion: jest.fn()
}));
jest.mock('../../src/middleware/auth', () => ({
  clearAuthUserCache: jest.fn()
}));

const User = require('../../src/models/User');
const BillingService = require('../../src/services/billingService');
const { clearAuthUserCache } = require('../../src/middleware/auth');
const userController = require('../../src/controllers/user.controller');

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

describe('user account deletion controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    BillingService.cancelSubscriptionForAccountDeletion.mockResolvedValue({
      canceled: false,
      reason: 'no_stripe_subscription'
    });
    User.deleteUser.mockResolvedValue(true);
  });

  test('stops billing before self-deletion and immediately clears auth cache', async () => {
    const user = {
      id: 'user-1',
      email: 'user@example.com',
      username: 'trader',
      role: 'user'
    };
    User.findByEmail.mockResolvedValue(user);
    User.verifyPassword.mockResolvedValue(true);
    const req = {
      user: { id: 'user-1', email: 'user@example.com' },
      body: { password: 'correct-password' }
    };
    const res = createResponse();
    const next = jest.fn();

    await userController.deleteOwnAccount(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(BillingService.cancelSubscriptionForAccountDeletion).toHaveBeenCalledWith('user-1');
    expect(User.deleteUser).toHaveBeenCalledWith('user-1', {
      deletionType: 'self',
      deletedByAdminId: null
    });
    expect(
      BillingService.cancelSubscriptionForAccountDeletion.mock.invocationCallOrder[0]
    ).toBeLessThan(User.deleteUser.mock.invocationCallOrder[0]);
    expect(clearAuthUserCache).toHaveBeenCalledWith('user-1');
    expect(res.payload).toEqual({ message: 'Account deleted successfully' });
  });

  test('leaves the account intact when Stripe cancellation cannot be confirmed', async () => {
    User.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      username: 'trader',
      role: 'user'
    });
    User.verifyPassword.mockResolvedValue(true);
    BillingService.cancelSubscriptionForAccountDeletion.mockRejectedValue(
      Object.assign(new Error('Stripe unavailable'), {
        code: 'ACCOUNT_DELETION_BILLING_CANCELLATION_FAILED'
      })
    );
    const req = {
      user: { id: 'user-1', email: 'user@example.com' },
      body: { password: 'correct-password' }
    };
    const res = createResponse();
    const next = jest.fn();

    await userController.deleteOwnAccount(req, res, next);

    expect(res.statusCode).toBe(503);
    expect(res.payload.error).toMatch(/billing could not be stopped/i);
    expect(User.deleteUser).not.toHaveBeenCalled();
    expect(clearAuthUserCache).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('stops billing and clears auth cache for an admin-initiated deletion', async () => {
    User.findByIdForAdmin.mockResolvedValue({
      id: 'user-1',
      username: 'trader',
      role: 'user'
    });
    const req = {
      user: { id: 'admin-1' },
      params: { userId: 'user-1' }
    };
    const res = createResponse();
    const next = jest.fn();

    await userController.deleteUser(req, res, next);

    expect(BillingService.cancelSubscriptionForAccountDeletion).toHaveBeenCalledWith('user-1');
    expect(User.deleteUser).toHaveBeenCalledWith('user-1', {
      deletionType: 'admin',
      deletedByAdminId: 'admin-1'
    });
    expect(clearAuthUserCache).toHaveBeenCalledWith('user-1');
    expect(next).not.toHaveBeenCalled();
  });
});
