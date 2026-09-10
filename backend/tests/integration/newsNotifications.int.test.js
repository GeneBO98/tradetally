jest.mock('../../src/services/notificationService', () => ({ sendSSENotification: jest.fn() }));

const { randomUUID } = require('crypto');
const db = require('../../src/config/database');
const NewsNotificationService = require('../../src/services/newsNotificationService');
const notificationsController = require('../../src/controllers/notifications.controller');

describe('news notification delivery with PostgreSQL', () => {
  const users = [];
  const story = () => ({
    id: 42, headline: 'Company announces new product',
    url: `https://example.com/${randomUUID()}`,
    datetime: Math.floor(Date.now() / 1000)
  });

  beforeAll(async () => {
    for (let index = 0; index < 3; index++) {
      const id = randomUUID();
      await db.query(`INSERT INTO users (id, email, username, password_hash, notify_news_open_positions)
        VALUES ($1, $2, $3, 'test-only', $4)`,
      [id, `news-${id}@example.com`, `news_${id.slice(0, 8)}`, index !== 1]);
      users.push(id);
      await db.query(`INSERT INTO trades (user_id, symbol, side, quantity, entry_price, exit_price, trade_date)
        VALUES ($1, 'AAPL', 'long', 1, 100, $2, CURRENT_DATE)`, [id, index === 2 ? 110 : null]);
    }
    // Multiple lots and symbols must still yield one copy of a shared story.
    await db.query(`INSERT INTO trades (user_id, symbol, side, quantity, entry_price, trade_date)
      VALUES ($1, 'AAPL', 'long', 1, 100, CURRENT_DATE),
             ($1, 'MSFT', 'long', 1, 100, CURRENT_DATE)`, [users[0]]);
  });

  afterAll(async () => {
    await db.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    await db.pool.end();
  });

  test('concurrent refreshes honor preferences, open positions, and persistent deduplication', async () => {
    const article = story();
    const counts = await Promise.all([
      NewsNotificationService.publishForSymbol('AAPL', [article]),
      NewsNotificationService.publishForSymbol('AAPL', [article]),
      NewsNotificationService.publishForSymbol('MSFT', [article])
    ]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    const notices = await db.query('SELECT * FROM notifications WHERE user_id = ANY($1::uuid[])', [users]);
    expect(notices.rows).toHaveLength(1);
    expect(notices.rows[0]).toEqual(expect.objectContaining({
      user_id: users[0], type: 'news_alert', read: false,
      data: expect.objectContaining({ headline: article.headline, url: article.url })
    }));

    const res = { json: jest.fn() };
    const next = jest.fn();
    await notificationsController.getUserNotifications({ user: { id: users[0] }, query: {} }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data[0]).toEqual(expect.objectContaining({
      symbol: expect.stringMatching(/AAPL|MSFT/), message: article.headline,
      metadata: expect.objectContaining({ url: article.url })
    }));

    await db.query('DELETE FROM notifications WHERE id = $1', [notices.rows[0].id]);
    expect(await NewsNotificationService.publishForSymbol('AAPL', [article])).toBe(0);
    expect(await NewsNotificationService.publishForSymbol('AAPL', [story()])).toBe(1);
  });
});
