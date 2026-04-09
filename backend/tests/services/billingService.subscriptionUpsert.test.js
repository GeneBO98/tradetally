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

const db = require('../../src/config/database');
const BillingService = require('../../src/services/billingService');

describe('BillingService.createOrUpdateSubscription', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('upserts subscriptions by user_id so each user keeps a single row', async () => {
    db.query.mockResolvedValue({ rows: [{ id: 'sub-row-1' }] });

    const result = await BillingService.createOrUpdateSubscription('user-1', {
      stripe_customer_id: 'cus_123',
      stripe_subscription_id: 'sub_123',
      stripe_price_id: 'price_123',
      status: 'active',
      current_period_start: new Date('2026-04-06T01:01:42.000Z'),
      current_period_end: new Date('2026-05-06T01:01:42.000Z'),
      cancel_at_period_end: false,
      canceled_at: null
    });

    expect(result).toEqual({ id: 'sub-row-1' });
    expect(db.query).toHaveBeenCalledTimes(1);

    const [query, values] = db.query.mock.calls[0];
    expect(query).toContain('ON CONFLICT (user_id)');
    expect(query).toContain('stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id)');
    expect(values).toEqual([
      'user-1',
      'cus_123',
      'sub_123',
      'price_123',
      'active',
      new Date('2026-04-06T01:01:42.000Z'),
      new Date('2026-05-06T01:01:42.000Z'),
      false,
      null
    ]);
  });
});
