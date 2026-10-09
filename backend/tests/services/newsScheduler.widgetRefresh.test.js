jest.mock('../../src/services/newsService', () => ({
  getAllTrackedSymbols: jest.fn(),
  fetchAndCacheAll: jest.fn(),
  getUserIdsTrackingSymbols: jest.fn()
}));

jest.mock('../../src/services/pushNotificationService', () => ({
  sendBackgroundRefresh: jest.fn()
}));

jest.mock('../../src/services/schedulerStatusService', () => ({
  recordStarted: jest.fn(),
  recordSuccess: jest.fn(),
  recordFailure: jest.fn(),
  get: jest.fn()
}));

const NewsService = require('../../src/services/newsService');
const pushNotificationService = require('../../src/services/pushNotificationService');
const SchedulerStatusService = require('../../src/services/schedulerStatusService');
const newsScheduler = require('../../src/services/newsScheduler');

describe('NewsScheduler widget refresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    SchedulerStatusService.recordStarted.mockResolvedValue(undefined);
    SchedulerStatusService.recordSuccess.mockResolvedValue(undefined);
    SchedulerStatusService.recordFailure.mockResolvedValue(undefined);
    newsScheduler.lastAttemptDate = null;
    newsScheduler.lastSuccessDate = null;
    newsScheduler.lastFailureDate = null;
    newsScheduler.lastError = null;
    newsScheduler.lastSummary = null;
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
    expect(SchedulerStatusService.recordStarted).toHaveBeenCalledWith('news', expect.any(Date));
    expect(SchedulerStatusService.recordSuccess).toHaveBeenCalledWith(
      'news',
      expect.objectContaining({ fetched: 2, usersTargeted: 2 }),
      expect.any(Date)
    );
    expect(newsScheduler.getStatus()).toEqual(expect.objectContaining({
      checkIntervalMinutes: 60,
      lastSuccessDate: expect.any(String),
      lastError: null
    }));
  });

  test('persists and exposes scheduler failures', async () => {
    NewsService.getAllTrackedSymbols.mockRejectedValue(new Error('news database unavailable'));

    await expect(newsScheduler.execute()).rejects.toThrow('news database unavailable');

    expect(SchedulerStatusService.recordFailure).toHaveBeenCalledWith(
      'news',
      expect.objectContaining({ message: 'news database unavailable' }),
      expect.any(Date)
    );
    expect(newsScheduler.getStatus()).toEqual(expect.objectContaining({
      lastFailureDate: expect.any(String),
      lastError: 'news database unavailable'
    }));
  });
});
