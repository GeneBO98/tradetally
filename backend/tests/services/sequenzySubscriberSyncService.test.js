jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));

const service = require('../../src/services/sequenzySubscriberSyncService');

describe('sequenzySubscriberSyncService', () => {
  test('buildPayload maps active subscribed users to active status and useful tags', () => {
    const payload = service.buildPayload({
      id: 42,
      email: 'user@example.com',
      username: 'testuser',
      full_name: 'Test User',
      role: 'admin',
      is_verified: true,
      admin_approved: true,
      is_active: true,
      timezone: 'America/Chicago',
      tier: 'pro',
      marketing_consent: true,
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-07T00:00:00.000Z',
      subscription_status: 'active',
      subscription_current_period_end: '2026-06-01T00:00:00.000Z',
      subscription_cancel_at_period_end: false
    });

    expect(payload.email).toBe('user@example.com');
    expect(payload.firstName).toBe('Test');
    expect(payload.lastName).toBe('User');
    expect(payload.status).toBe('active');
    expect(payload.tags).toEqual(expect.arrayContaining([
      'tradetally-user',
      'role.admin',
      'tier.pro',
      'subscription.active',
      'marketing-consent',
      'email-verified'
    ]));
    expect(payload.customAttributes).toMatchObject({
      userId: '42',
      username: 'testuser',
      marketingConsent: true,
      tier: 'pro',
      subscriptionStatus: 'active'
    });
  });

  test('buildPayload maps non-consenting users to unsubscribed status', () => {
    const payload = service.buildPayload({
      id: 7,
      email: 'user@example.com',
      username: 'testuser',
      full_name: 'Test User',
      role: 'user',
      is_verified: false,
      admin_approved: true,
      is_active: true,
      timezone: null,
      tier: 'free',
      marketing_consent: false,
      created_at: null,
      updated_at: null,
      subscription_status: null,
      subscription_current_period_end: null,
      subscription_cancel_at_period_end: null
    });

    expect(payload.status).toBe('unsubscribed');
    expect(payload.tags).toContain('marketing-opted-out');
    expect(payload.tags).toContain('email-unverified');
  });

  test('buildPayload maps unverified users to unsubscribed status even with marketing consent', () => {
    const payload = service.buildPayload({
      id: 8,
      email: 'user@example.com',
      username: 'testuser',
      full_name: 'Test User',
      role: 'user',
      is_verified: false,
      admin_approved: true,
      is_active: true,
      timezone: null,
      tier: 'free',
      marketing_consent: true,
      created_at: null,
      updated_at: null,
      subscription_status: null,
      subscription_current_period_end: null,
      subscription_cancel_at_period_end: null
    });

    expect(payload.status).toBe('unsubscribed');
    expect(payload.tags).toContain('marketing-consent');
    expect(payload.tags).toContain('email-unverified');
  });
});
