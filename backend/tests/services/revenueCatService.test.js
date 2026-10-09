jest.mock('axios');
jest.mock('../../src/config/database', () => ({ connect: jest.fn() }));
jest.mock('../../src/services/tierCache', () => ({ invalidate: jest.fn() }));
jest.mock('../../src/services/settingsCache', () => ({ invalidate: jest.fn() }));

const axios = require('axios');
const db = require('../../src/config/database');
const tierCache = require('../../src/services/tierCache');
const revenueCatService = require('../../src/services/revenueCatService');

describe('RevenueCat subscription synchronization', () => {
  const originalEnv = process.env;
  let client;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      REVENUECAT_API_V2_KEY: 'secret-key',
      REVENUECAT_SECRET_API_KEY: undefined,
      REVENUECAT_ENTITLEMENT_ID: 'pro',
      REVENUECAT_WEBHOOK_AUTHORIZATION: 'Bearer webhook-secret'
    };
    client = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn()
    };
    db.connect.mockResolvedValue(client);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('grants Pro from a current server-verified entitlement', async () => {
    axios.get.mockResolvedValue({
      data: {
        subscriber: {
          entitlements: {
            pro: {
              product_identifier: 'tradetallymonthly',
              expires_date: '2099-01-01T00:00:00Z'
            }
          }
        }
      }
    });

    const result = await revenueCatService.syncUserEntitlement('user/1');

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.revenuecat.com/v1/subscribers/user%2F1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer secret-key' })
      })
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tier_overrides'),
      ['user/1', 'RevenueCat Subscription', new Date('2099-01-01T00:00:00Z')]
    );
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(tierCache.invalidate).toHaveBeenCalledWith('user/1');
    expect(result).toEqual(expect.objectContaining({
      active: true,
      productId: 'tradetallymonthly'
    }));
  });

  test('keeps the temporary secret-key variable as a compatibility fallback', async () => {
    delete process.env.REVENUECAT_API_V2_KEY;
    process.env.REVENUECAT_SECRET_API_KEY = 'fallback-secret-key';
    axios.get.mockResolvedValue({ data: { subscriber: { entitlements: {} } } });

    await revenueCatService.syncUserEntitlement('user-fallback');

    expect(axios.get).toHaveBeenCalledWith(
      'https://api.revenuecat.com/v1/subscribers/user-fallback',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer fallback-secret-key' })
      })
    );
  });

  test('uses a valid billing grace period when the normal expiration passed', () => {
    const entitlement = revenueCatService.resolveActiveEntitlement({
      subscriber: {
        entitlements: {
          pro: {
            product_identifier: 'tradetallymonthly',
            expires_date: '2026-01-01T00:00:00Z',
            grace_period_expires_date: '2026-02-01T00:00:00Z'
          }
        }
      }
    }, 'pro', new Date('2026-01-15T00:00:00Z'));

    expect(entitlement.expiresAt).toEqual(new Date('2026-02-01T00:00:00Z'));
  });

  test('removes only its own override when the entitlement is inactive', async () => {
    axios.get.mockResolvedValue({
      data: {
        subscriber: {
          entitlements: {
            pro: { expires_date: '2020-01-01T00:00:00Z' }
          }
        }
      }
    });

    const result = await revenueCatService.syncUserEntitlement('user-2');

    expect(client.query).toHaveBeenCalledWith(
      'DELETE FROM tier_overrides WHERE user_id = $1 AND reason = $2',
      ['user-2', 'RevenueCat Subscription']
    );
    expect(result.active).toBe(false);
  });

  test('does not mutate access when RevenueCat is unavailable', async () => {
    axios.get.mockRejectedValue(new Error('network down'));

    await expect(revenueCatService.syncUserEntitlement('user-3')).rejects.toThrow('network down');
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('authenticates webhook authorization headers without partial matches', () => {
    expect(revenueCatService.isWebhookAuthorized('Bearer webhook-secret')).toBe(true);
    expect(revenueCatService.isWebhookAuthorized('webhook-secret')).toBe(true);
    expect(revenueCatService.isWebhookAuthorized('Bearer webhook')).toBe(false);
    expect(revenueCatService.isWebhookAuthorized()).toBe(false);
  });

  test('extracts TradeTally UUIDs from RevenueCat identity fields', () => {
    expect(revenueCatService.extractTradeTallyUserIds({
      app_user_id: '$RCAnonymousID:abc',
      original_app_user_id: 'bf3cb8bb-c3d8-43af-96a9-2b93ccf6708f',
      aliases: [
        '$RCAnonymousID:abc',
        '0ab8bd3c-64f2-460c-9f15-6c62b7eed40e',
        '0ab8bd3c-64f2-460c-9f15-6c62b7eed40e'
      ]
    })).toEqual([
      'bf3cb8bb-c3d8-43af-96a9-2b93ccf6708f',
      '0ab8bd3c-64f2-460c-9f15-6c62b7eed40e'
    ]);
  });

  test('uses the authenticated webhook payload without a RevenueCat API lookup', async () => {
    const result = await revenueCatService.processWebhook({
      api_version: '1.0',
      event: {
        id: 'event-1',
        type: 'INITIAL_PURCHASE',
        app_user_id: '$RCAnonymousID:abc',
        aliases: ['0ab8bd3c-64f2-460c-9f15-6c62b7eed40e'],
        entitlement_ids: ['pro'],
        product_id: 'monthly-15',
        expiration_at_ms: new Date('2099-09-28T15:53:00Z').getTime()
      }
    });

    expect(axios.get).not.toHaveBeenCalled();
    expect(result.processedUserIds).toEqual(['0ab8bd3c-64f2-460c-9f15-6c62b7eed40e']);
    expect(result.results[0]).toEqual(expect.objectContaining({
      active: true,
      productId: 'monthly-15'
    }));
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tier_overrides'),
      [
        '0ab8bd3c-64f2-460c-9f15-6c62b7eed40e',
        'RevenueCat Subscription',
        new Date('2099-09-28T15:53:00Z')
      ]
    );
  });

  test('keeps access through the paid period when a subscription is canceled', async () => {
    const result = await revenueCatService.processWebhook({
      event: {
        type: 'CANCELLATION',
        app_user_id: '0ab8bd3c-64f2-460c-9f15-6c62b7eed40e',
        entitlement_ids: ['pro'],
        product_id: 'monthly-15',
        expiration_at_ms: new Date('2099-09-28T15:53:00Z').getTime()
      }
    });

    expect(result.results[0]).toEqual(expect.objectContaining({ active: true }));
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO tier_overrides'),
      expect.arrayContaining(['RevenueCat Subscription'])
    );
  });

  test('revokes only an override that was not extended by a newer renewal', async () => {
    const expiration = new Date('2026-09-28T15:53:00Z');
    const result = await revenueCatService.processWebhook({
      event: {
        type: 'EXPIRATION',
        app_user_id: '0ab8bd3c-64f2-460c-9f15-6c62b7eed40e',
        entitlement_ids: ['pro'],
        product_id: 'monthly-15',
        expiration_at_ms: expiration.getTime()
      }
    });

    expect(result.results[0]).toEqual(expect.objectContaining({ active: false }));
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('AND expires_at <= $3'),
      [
        '0ab8bd3c-64f2-460c-9f15-6c62b7eed40e',
        'RevenueCat Subscription',
        expiration
      ]
    );
  });

  test('ignores webhook events for unrelated entitlements', async () => {
    const result = await revenueCatService.processWebhook({
      event: {
        type: 'INITIAL_PURCHASE',
        app_user_id: '0ab8bd3c-64f2-460c-9f15-6c62b7eed40e',
        entitlement_ids: ['other'],
        expiration_at_ms: new Date('2099-09-28T15:53:00Z').getTime()
      }
    });

    expect(result.results[0]).toEqual(expect.objectContaining({ ignored: true }));
    expect(db.connect).not.toHaveBeenCalled();
  });

  test('does not turn a malformed subscription event into lifetime access', async () => {
    const result = await revenueCatService.processWebhook({
      event: {
        type: 'RENEWAL',
        app_user_id: '0ab8bd3c-64f2-460c-9f15-6c62b7eed40e',
        entitlement_ids: ['pro'],
        expiration_at_ms: 'not-a-timestamp'
      }
    });

    expect(result.results[0]).toEqual(expect.objectContaining({ ignored: true }));
    expect(db.connect).not.toHaveBeenCalled();
  });
});
