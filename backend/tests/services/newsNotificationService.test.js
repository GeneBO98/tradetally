jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/notificationService', () => ({ sendSSENotification: jest.fn(), sendMobileNotification: jest.fn() }));
jest.mock('../../src/services/tierService', () => ({ getUserTier: jest.fn() }));

const db = require('../../src/config/database');
const NotificationService = require('../../src/services/notificationService');
const TierService = require('../../src/services/tierService');
const NewsNotificationService = require('../../src/services/newsNotificationService');

describe('news article notifications', () => {
  const article = overrides => ({
    id: 1, headline: 'Company update', url: 'https://example.com/story',
    datetime: Math.floor(Date.now() / 1000), ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
    TierService.getUserTier.mockResolvedValue('pro');
  });

  test('ignores old, future, undated, and unidentifiable articles', async () => {
    await NewsNotificationService.publishForSymbol('AAPL', [
      article({ datetime: Date.now() / 1000 - 86401 }),
      article({ datetime: Date.now() / 1000 + 3600 }),
      article({ datetime: undefined }),
      article({ url: '', id: null }),
      article({ headline: '' })
    ]);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('coalesces duplicate URLs and sends saved headlines with article metadata', async () => {
    const data = article();
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'user' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'notice', user_id: 'user', data }] });
    expect(await NewsNotificationService.publishForSymbol(' aapl ', [data, article({ id: 2 })])).toBe(1);
    expect(db.query.mock.calls[0][1]).toEqual(['AAPL']);
    const [, params] = db.query.mock.calls[1];
    expect(params[0]).toEqual(['user']);
    const candidates = JSON.parse(params[1]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].data).toEqual(expect.objectContaining({
      headline: data.headline, message: data.headline, url: data.url
    }));
    expect(NotificationService.sendSSENotification).toHaveBeenCalledWith('user', {
      type: 'news_alert', data: { ...data, notification_id: 'notice' }
    });
    expect(NotificationService.sendMobileNotification).toHaveBeenCalledTimes(1);
    expect(NotificationService.sendMobileNotification).toHaveBeenCalledWith('user', 'news_alert', data, 'notice');
  });

  test('does not broadcast already delivered or ineligible articles', async () => {
    expect(await NewsNotificationService.publishForSymbol('AAPL', [article()])).toBe(0);
    expect(NotificationService.sendSSENotification).not.toHaveBeenCalled();
    expect(NotificationService.sendMobileNotification).not.toHaveBeenCalled();
  });

  test('only Pro users receive news notifications', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ user_id: 'free-user' }, { user_id: 'pro-user' }] })
      .mockResolvedValueOnce({ rows: [] });
    TierService.getUserTier.mockImplementation(async id => (id === 'pro-user' ? 'pro' : 'free'));
    await NewsNotificationService.publishForSymbol('AAPL', [article()]);
    expect(db.query.mock.calls[1][1][0]).toEqual(['pro-user']);
  });

  test('skips delivery entirely when no eligible user is Pro', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ user_id: 'free-user' }] });
    TierService.getUserTier.mockResolvedValue('free');
    expect(await NewsNotificationService.publishForSymbol('AAPL', [article()])).toBe(0);
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(NotificationService.sendMobileNotification).not.toHaveBeenCalled();
  });
});
