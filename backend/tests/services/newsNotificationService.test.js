jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/notificationService', () => ({ sendSSENotification: jest.fn() }));

const db = require('../../src/config/database');
const NotificationService = require('../../src/services/notificationService');
const NewsNotificationService = require('../../src/services/newsNotificationService');

describe('news article notifications', () => {
  const article = overrides => ({
    id: 1, headline: 'Company update', url: 'https://example.com/story',
    datetime: Math.floor(Date.now() / 1000), ...overrides
  });

  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockResolvedValue({ rows: [] });
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
    db.query.mockResolvedValueOnce({ rows: [{ id: 'notice', user_id: 'user', data }] });
    expect(await NewsNotificationService.publishForSymbol(' aapl ', [data, article({ id: 2 })])).toBe(1);
    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe('AAPL');
    const candidates = JSON.parse(params[1]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].data).toEqual(expect.objectContaining({
      headline: data.headline, message: data.headline, url: data.url
    }));
    expect(NotificationService.sendSSENotification).toHaveBeenCalledWith('user', {
      type: 'news_alert', data: { ...data, notification_id: 'notice' }
    });
  });

  test('does not broadcast already delivered or ineligible articles', async () => {
    expect(await NewsNotificationService.publishForSymbol('AAPL', [article()])).toBe(0);
    expect(NotificationService.sendSSENotification).not.toHaveBeenCalled();
  });
});
