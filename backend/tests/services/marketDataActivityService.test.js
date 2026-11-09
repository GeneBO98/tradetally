jest.mock('../../src/config/database', () => ({
  query: jest.fn()
}));
jest.mock('../../src/services/tierService', () => ({
  isBillingEnabled: jest.fn()
}));

const db = require('../../src/config/database');
const TierService = require('../../src/services/tierService');
const MarketDataActivityService = require('../../src/services/marketDataActivityService');

describe('MarketDataActivityService', () => {
  const originalDays = process.env.MARKET_DATA_ACTIVE_USER_DAYS;

  beforeEach(() => {
    jest.clearAllMocks();
    MarketDataActivityService.resetCache();
    delete process.env.MARKET_DATA_ACTIVE_USER_DAYS;
  });

  afterAll(() => {
    if (originalDays === undefined) delete process.env.MARKET_DATA_ACTIVE_USER_DAYS;
    else process.env.MARKET_DATA_ACTIVE_USER_DAYS = originalDays;
  });

  test('does not filter on self-hosted installs by default', async () => {
    TierService.isBillingEnabled.mockResolvedValue(false);

    expect(await MarketDataActivityService.getActiveUserIds()).toBeNull();
    expect(await MarketDataActivityService.filterActiveUserIds(['a', 'b'])).toEqual(['a', 'b']);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('uses a 30 day window on billed deployments and memoizes the lookup', async () => {
    TierService.isBillingEnabled.mockResolvedValue(true);
    db.query.mockResolvedValue({ rows: [{ id: 'a' }, { id: 'c' }] });

    expect(await MarketDataActivityService.filterActiveUserIds(['a', 'b', 'c'])).toEqual(['a', 'c']);
    expect(await MarketDataActivityService.getActiveUserIdArray()).toEqual(['a', 'c']);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls[0][0]).toContain('user_activity_events');
    expect(db.query.mock.calls[0][1]).toEqual([30]);
  });

  test('honors the env override, including 0 to disable', async () => {
    TierService.isBillingEnabled.mockResolvedValue(true);
    process.env.MARKET_DATA_ACTIVE_USER_DAYS = '0';
    expect(await MarketDataActivityService.getActiveUserIds()).toBeNull();

    process.env.MARKET_DATA_ACTIVE_USER_DAYS = '14';
    db.query.mockResolvedValue({ rows: [] });
    await MarketDataActivityService.getActiveUserIds();
    expect(db.query.mock.calls[0][1]).toEqual([14]);
  });

  test('fails open when the lookup errors', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    TierService.isBillingEnabled.mockResolvedValue(true);
    db.query.mockRejectedValue(new Error('db down'));

    expect(await MarketDataActivityService.filterActiveUserIds(['a'])).toEqual(['a']);
    error.mockRestore();
  });
});
