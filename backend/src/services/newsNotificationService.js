const { createHash } = require('crypto');
const db = require('../config/database');
const NotificationService = require('./notificationService');

const MAX_ARTICLE_AGE_MS = 24 * 60 * 60 * 1000;

class NewsNotificationService {
  static async publishForSymbol(symbol, items) {
    symbol = symbol.trim().toUpperCase();
    const now = Date.now();
    const articles = new Map();
    for (const item of items) {
      const publishedAt = Number(item.datetime) * 1000;
      // A first fetch should not flood the inbox with the entire cached week.
      if (!item.headline || !Number.isFinite(publishedAt) ||
          publishedAt < now - MAX_ARTICLE_AGE_MS || publishedAt > now) continue;

      const identity = item.url?.trim() || (item.id != null ? `finnhub:${item.id}` : null);
      if (!identity) continue;
      const articleKey = createHash('sha256').update(identity).digest('hex');
      articles.set(articleKey, {
        article_key: articleKey,
        data: {
          symbol, headline: item.headline, message: item.headline,
          summary: item.summary, source: item.source, url: item.url,
          datetime: item.datetime, article_key: articleKey
        }
      });
    }
    if (articles.size === 0) return 0;

    // Claim and save in one statement: concurrent refreshes, multiple positions,
    // and the same story appearing for several symbols still deliver only once.
    // A failed insert rolls back the receipt too, allowing the next fetch to retry.
    const result = await db.query(`
      WITH articles AS (
        SELECT * FROM jsonb_to_recordset($2::jsonb)
          AS article(article_key text, data jsonb)
      ), eligible_users AS (
        SELECT DISTINCT t.user_id
        FROM trades t
        JOIN users u ON u.id = t.user_id
        WHERE t.exit_price IS NULL AND UPPER(t.symbol) = $1
          AND u.notify_news_open_positions = true
      ), claimed AS (
        INSERT INTO news_notification_deliveries (user_id, article_key)
        SELECT u.user_id, a.article_key FROM eligible_users u CROSS JOIN articles a
        ORDER BY u.user_id, a.article_key
        ON CONFLICT (user_id, article_key) DO NOTHING
        RETURNING user_id, article_key
      )
      INSERT INTO notifications (user_id, type, data)
      SELECT c.user_id, 'news_alert', a.data
      FROM claimed c JOIN articles a USING (article_key)
      RETURNING id, user_id, data
    `, [symbol, JSON.stringify([...articles.values()])]);

    for (const notification of result.rows) {
      await NotificationService.sendSSENotification(notification.user_id, {
        type: 'news_alert',
        data: { ...notification.data, notification_id: notification.id }
      });
    }
    return result.rows.length;
  }
}

module.exports = NewsNotificationService;
