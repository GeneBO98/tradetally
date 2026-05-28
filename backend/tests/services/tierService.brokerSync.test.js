// Broker sync is a Pro feature. These tests pin down the gating + grace-period
// logic so a future change can't silently reopen the free-tier loophole
// (where free users bypassed the 100-trade CSV import limit via broker sync).

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/models/User', () => ({}));

const TierService = require('../../src/services/tierService');

const FUTURE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // +7 days
const PAST = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // -7 days

describe('TierService broker sync access', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('self-hosted (billing disabled)', () => {
    beforeEach(() => {
      jest.spyOn(TierService, 'isBillingEnabled').mockResolvedValue(false);
    });

    test('everyone can create and sync regardless of tier', async () => {
      const create = await TierService.canCreateBrokerConnection('u1');
      const sync = await TierService.canSyncBrokerConnection('u1');
      const access = await TierService.getBrokerSyncAccess('u1');

      expect(create.allowed).toBe(true);
      expect(sync.allowed).toBe(true);
      expect(access).toMatchObject({ isPro: true, billingEnabled: false, canCreate: true, canSync: true });
    });
  });

  describe('cloud (billing enabled)', () => {
    beforeEach(() => {
      jest.spyOn(TierService, 'isBillingEnabled').mockResolvedValue(true);
    });

    test('pro user can create and sync', async () => {
      jest.spyOn(TierService, 'getUserTier').mockResolvedValue('pro');

      expect((await TierService.canCreateBrokerConnection('u1')).allowed).toBe(true);
      expect((await TierService.canSyncBrokerConnection('u1')).allowed).toBe(true);
      expect(await TierService.getBrokerSyncAccess('u1')).toMatchObject({
        isPro: true, canCreate: true, canSync: true, inGracePeriod: false
      });
    });

    test('free user can never create a new connection', async () => {
      jest.spyOn(TierService, 'getUserTier').mockResolvedValue('free');
      jest.spyOn(TierService, '_brokerSyncGraceEndsAt').mockReturnValue(FUTURE);

      const create = await TierService.canCreateBrokerConnection('u1');
      expect(create.allowed).toBe(false);
      expect(create.code).toBe('PRO_FEATURE_REQUIRED');
      expect(create.requiredTier).toBe('pro');
    });

    test('free user can still sync DURING the grace window', async () => {
      jest.spyOn(TierService, 'getUserTier').mockResolvedValue('free');
      jest.spyOn(TierService, '_brokerSyncGraceEndsAt').mockReturnValue(FUTURE);

      const sync = await TierService.canSyncBrokerConnection('u1');
      expect(sync.allowed).toBe(true);
      expect(sync.inGracePeriod).toBe(true);

      const access = await TierService.getBrokerSyncAccess('u1');
      expect(access).toMatchObject({ isPro: false, canCreate: false, canSync: true, inGracePeriod: true });
    });

    test('free user CANNOT sync after the grace window ends', async () => {
      jest.spyOn(TierService, 'getUserTier').mockResolvedValue('free');
      jest.spyOn(TierService, '_brokerSyncGraceEndsAt').mockReturnValue(PAST);

      const sync = await TierService.canSyncBrokerConnection('u1');
      expect(sync.allowed).toBe(false);
      expect(sync.inGracePeriod).toBe(false);
      expect(sync.code).toBe('PRO_FEATURE_REQUIRED');

      const access = await TierService.getBrokerSyncAccess('u1');
      expect(access).toMatchObject({ isPro: false, canCreate: false, canSync: false, inGracePeriod: false });
    });
  });
});
