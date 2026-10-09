const db = require('../config/database');
const logger = require('../utils/logger');

const PUSH_INTERVAL_MS = 2000;

// userId -> pending timer
const pendingPushes = new Map();

async function pushEnrichmentStatus(userId) {
  const statusResult = await db.query(`
    SELECT enrichment_status, COUNT(*) as count
    FROM trades
    WHERE user_id = $1
    GROUP BY enrichment_status
    ORDER BY enrichment_status
  `, [userId]);

  const notificationsController = require('../controllers/notifications.controller');
  await notificationsController.sendEnrichmentUpdateToUser(userId, {
    tradeEnrichment: statusResult.rows.map(row => ({
      enrichment_status: row.enrichment_status,
      count: row.count
    }))
  });
}

// Sends the user's enrichment counts over SSE at most once per
// PUSH_INTERVAL_MS. Completions inside the window share one push, and the
// counts are read when it fires, so the last push always reflects the final
// state. An import of thousands of trades costs one count query every 2s
// instead of one per trade.
function scheduleEnrichmentStatusPush(userId) {
  if (!userId || pendingPushes.has(userId)) return;

  const timer = setTimeout(() => {
    pendingPushes.delete(userId);
    pushEnrichmentStatus(userId).catch((error) => {
      logger.logError(`Failed to send enrichment status update for user ${userId}: ${error.message}`);
    });
  }, PUSH_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  pendingPushes.set(userId, timer);
}

module.exports = {
  scheduleEnrichmentStatusPush,
  PUSH_INTERVAL_MS
};
