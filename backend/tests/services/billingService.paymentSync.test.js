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
jest.mock('../../src/services/emailService', () => ({
  sendSubscriptionWelcomeEmail: jest.fn(),
  sendNewSubscriberNotification: jest.fn()
}));
jest.mock('../../src/services/invoiceNinjaSyncService', () => ({
  initialize: jest.fn(),
  syncStripeInvoiceRevenue: jest.fn()
}));

const db = require('../../src/config/database');
const BillingService = require('../../src/services/billingService');
const invoiceNinjaSyncService = require('../../src/services/invoiceNinjaSyncService');

describe('BillingService.handlePaymentSucceeded', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('resolves the user by Stripe subscription and syncs Invoice Ninja revenue', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 'user-1' }] });
    invoiceNinjaSyncService.initialize.mockReturnValue(true);
    invoiceNinjaSyncService.syncStripeInvoiceRevenue.mockResolvedValue({
      invoice: { id: 'inv_ninja_1' }
    });

    await BillingService.handlePaymentSucceeded({
      id: 'in_123',
      subscription: 'sub_123',
      customer: 'cus_123',
      amount_paid: 800,
      currency: 'usd'
    });

    expect(db.query).toHaveBeenCalledWith(
      expect.stringContaining('stripe_subscription_id'),
      ['sub_123']
    );
    expect(invoiceNinjaSyncService.initialize).toHaveBeenCalled();
    expect(invoiceNinjaSyncService.syncStripeInvoiceRevenue).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ id: 'in_123' })
    );
  });
});
