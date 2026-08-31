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
      REVENUECAT_SECRET_API_KEY: 'secret-key',
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
    expect(revenueCatService.isWebhookAuthorized('Bearer webhook')).toBe(false);
    expect(revenueCatService.isWebhookAuthorized()).toBe(false);
  });

  test('extracts the TradeTally UUID from RevenueCat aliases', () => {
    expect(revenueCatService.extractTradeTallyUserIds({
      app_user_id: '$RCAnonymousID:abc',
      aliases: [
        '$RCAnonymousID:abc',
        '0ab8bd3c-64f2-460c-9f15-6c62b7eed40e',
        '0ab8bd3c-64f2-460c-9f15-6c62b7eed40e'
      ]
    })).toEqual(['0ab8bd3c-64f2-460c-9f15-6c62b7eed40e']);
  });

  test('reconciles webhook events against current RevenueCat state', async () => {
    axios.get.mockResolvedValue({
      data: {
        subscriber: {
          entitlements: {
            pro: {
              product_identifier: 'monthly-15',
              expires_date: '2099-09-28T15:53:00Z'
            }
          }
        }
      }
    });

    const result = await revenueCatService.processWebhook({
      api_version: '1.0',
      event: {
        type: 'CANCELLATION',
        app_user_id: '$RCAnonymousID:abc',
        aliases: ['0ab8bd3c-64f2-460c-9f15-6c62b7eed40e']
      }
    });

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
});
