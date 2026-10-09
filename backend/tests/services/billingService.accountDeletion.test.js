jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/tierService', () => ({
  isBillingEnabled: jest.fn()
}));
jest.mock('../../src/models/User', () => ({
  getSubscription: jest.fn(),
  findById: jest.fn()
}));
jest.mock('../../src/services/emailService', () => ({}));
jest.mock('../../src/services/invoiceNinjaSyncService', () => ({}));

const User = require('../../src/models/User');
const BillingService = require('../../src/services/billingService');

describe('BillingService.cancelSubscriptionForAccountDeletion', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  test('does nothing when the account has no Stripe subscription', async () => {
    User.getSubscription.mockResolvedValue(null);
    const billingAvailable = jest.spyOn(BillingService, 'isBillingAvailable');

    await expect(
      BillingService.cancelSubscriptionForAccountDeletion('user-1')
    ).resolves.toEqual({ canceled: false, reason: 'no_stripe_subscription' });

    expect(billingAvailable).not.toHaveBeenCalled();
  });

  test('cancels Stripe immediately and records the cancellation before deletion', async () => {
    User.getSubscription.mockResolvedValue({
      stripe_subscription_id: 'sub_123',
      status: 'active'
    });
    jest.spyOn(BillingService, 'isBillingAvailable').mockResolvedValue(true);
    const cancel = jest.fn().mockResolvedValue({
      id: 'sub_123',
      status: 'canceled',
      canceled_at: 1_700_000_000
    });
    jest.spyOn(BillingService, 'getStripe').mockReturnValue({
      subscriptions: { cancel }
    });
    const persist = jest
      .spyOn(BillingService, 'createOrUpdateSubscription')
      .mockResolvedValue({});

    await expect(
      BillingService.cancelSubscriptionForAccountDeletion('user-1')
    ).resolves.toEqual({ canceled: true, subscriptionId: 'sub_123' });

    expect(cancel).toHaveBeenCalledWith('sub_123');
    expect(persist).toHaveBeenCalledWith('user-1', {
      stripe_subscription_id: 'sub_123',
      status: 'canceled',
      cancel_at_period_end: false,
      canceled_at: new Date(1_700_000_000 * 1000)
    });
  });

  test('fails closed when Stripe cannot confirm cancellation', async () => {
    User.getSubscription.mockResolvedValue({
      stripe_subscription_id: 'sub_123',
      status: 'active'
    });
    jest.spyOn(BillingService, 'isBillingAvailable').mockResolvedValue(true);
    jest.spyOn(BillingService, 'getStripe').mockReturnValue({
      subscriptions: { cancel: jest.fn().mockRejectedValue(new Error('timeout')) }
    });
    const persist = jest.spyOn(BillingService, 'createOrUpdateSubscription');

    await expect(
      BillingService.cancelSubscriptionForAccountDeletion('user-1')
    ).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_BILLING_CANCELLATION_FAILED'
    });

    expect(persist).not.toHaveBeenCalled();
  });

  test('fails closed on resource_missing because Stripe credentials may target the wrong account', async () => {
    User.getSubscription.mockResolvedValue({
      stripe_subscription_id: 'sub_missing',
      status: 'active'
    });
    jest.spyOn(BillingService, 'isBillingAvailable').mockResolvedValue(true);
    jest.spyOn(BillingService, 'getStripe').mockReturnValue({
      subscriptions: {
        cancel: jest.fn().mockRejectedValue({ code: 'resource_missing' })
      }
    });
    const persist = jest.spyOn(BillingService, 'createOrUpdateSubscription');

    await expect(
      BillingService.cancelSubscriptionForAccountDeletion('user-1')
    ).rejects.toMatchObject({
      code: 'ACCOUNT_DELETION_BILLING_CANCELLATION_FAILED'
    });

    expect(persist).not.toHaveBeenCalled();
  });
});
