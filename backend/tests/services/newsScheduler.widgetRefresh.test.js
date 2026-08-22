jest.mock('../../src/services/newsService', () => ({
  getAllTrackedSymbols: jest.fn(),
  fetchAndCacheAll: jest.fn(),
  getUserIdsTrackingSymbols: jest.fn()
}));

jest.mock('../../src/services/pushNotificationService', () => ({
  sendBackgroundRefresh: jest.fn()
}));

const NewsService = require('../../src/services/newsService');
const pushNotificationService = require('../../src/services/pushNotificationService');
const newsScheduler = require('../../src/services/newsScheduler');

describe('NewsScheduler widget refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('sends one silent refresh to each user affected by changed news', async () => {
    NewsService.getAllTrackedSymbols.mockResolvedValue(['AAPL', 'MSFT']);
    NewsService.fetchAndCacheAll.mockResolvedValue({
      fetched: 2,
      skipped: 0,
      errors: 0,
      total: 2,
      changedSymbols: ['AAPL']
    });
    NewsService.getUserIdsTrackingSymbols.mockResolvedValue(['user-1', 'user-2']);
    pushNotificationService.sendBackgroundRefresh
      .mockResolvedValueOnce({ success: true })
      .mockResolvedValueOnce({ success: false });

    const summary = await newsScheduler.execute();

    expect(pushNotificationService.sendBackgroundRefresh).toHaveBeenCalledTimes(2);
    expect(pushNotificationService.sendBackgroundRefresh).toHaveBeenCalledWith('user-1', 'news_updated');
    expect(summary).toEqual(expect.objectContaining({ usersTargeted: 2, usersNotified: 1 }));
  });
});
