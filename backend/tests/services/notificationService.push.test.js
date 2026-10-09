jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/services/notificationPreferenceService', () => ({ isNotificationEnabled: jest.fn().mockResolvedValue(true) }));
jest.mock('../../src/services/pushNotificationService', () => ({ sendInboxNotification: jest.fn() }));

const db = require('../../src/config/database');
const notifications = require('../../src/services/notificationService');
const push = require('../../src/services/pushNotificationService');

describe('persisted mobile notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.query.mockImplementation(async sql => {
      if (sql.includes('SELECT EXISTS')) return { rows: [{ exists: true }] };
      if (sql.includes('earned_count')) return { rows: [{ earned_count: 1, engaged_users: 10 }] };
      return { rows: [{ id: 'notice-1' }] };
    });
    push.sendInboxNotification.mockResolvedValue({ success: true });
    jest.spyOn(notifications, 'sendSSENotification').mockResolvedValue();
  });
  afterEach(() => { jest.restoreAllMocks(); });

  test('new achievements persist, broadcast, and dispatch one mobile alert', async () => {
    await notifications.sendAchievementNotification('user-1', { id: 'award-1', name: 'Consistent Trader' });
    expect(notifications.sendSSENotification).toHaveBeenCalledWith('user-1', expect.objectContaining({ type: 'achievement_earned' }));
    expect(push.sendInboxNotification).toHaveBeenCalledTimes(1);
    expect(push.sendInboxNotification).toHaveBeenCalledWith('user-1', 'achievement_earned', expect.objectContaining({
      achievement: expect.objectContaining({ id: 'award-1', name: 'Consistent Trader' })
    }), 'notice-1');
  });

  test.each([
    ['sendLevelUpNotification', [5, 4], 'level_up'],
    ['sendNewsNotification', [{ symbol: 'AAPL', headline: 'Company update' }], 'news_alert'],
    ['sendEarningsNotification', [{ symbol: 'AAPL', company: 'Apple' }], 'earnings_announcement'],
    ['sendBehavioralAlert', ['overtrading', 'high', 'Take a break'], 'behavioral_alert'],
    ['sendTradeReminderNotification', [{ message: 'Review your position' }], 'trade_reminder']
  ])('%s dispatches the saved event to mobile', async (method, args, type) => {
    await notifications[method]('user-1', ...args);
    expect(push.sendInboxNotification).toHaveBeenCalledTimes(1);
    expect(push.sendInboxNotification).toHaveBeenCalledWith('user-1', type, expect.any(Object), 'notice-1');
  });

  test('APNs failure does not lose the saved notification or stop SSE', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    push.sendInboxNotification.mockRejectedValue(new Error('APNs unavailable'));
    const saved = await notifications.saveNotification('user-1', 'level_up', { newLevel: 5 });
    expect(saved.id).toBe('notice-1');
    await notifications.sendLevelUpNotification('user-1', 6, 5);
    expect(notifications.sendSSENotification).toHaveBeenCalled();
  });

  test('failed persistence does not push an event that cannot be found in the inbox', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    db.query.mockRejectedValue(new Error('DB unavailable'));
    expect(await notifications.saveNotification('user-1', 'level_up', { newLevel: 5 })).toBeNull();
    expect(push.sendInboxNotification).not.toHaveBeenCalled();
  });
});
