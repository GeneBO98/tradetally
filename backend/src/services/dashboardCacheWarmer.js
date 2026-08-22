const IntervalScheduler = require('./schedulers/IntervalScheduler');
const db = require('../config/database');
const cache = require('../utils/cache');
const AnalyticsCache = require('./analyticsCache');
const TradeQueries = require('./tradeQueries');
const analyticsController = require('../controllers/analytics.controller');
const pushNotificationService = require('./pushNotificationService');
const { getDateInTimezone, getDayOfWeekInTimezone } = require('../utils/timezone');

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const DEFAULT_ACTIVE_DAYS = 30;
const DEFAULT_USER_LIMIT = 100;
// Background pushes are best-effort and may be throttled by iOS when sent too
// frequently. Keep warming server caches every 15 minutes, but wake a given
// user's widget at most twice an hour by default.
const DEFAULT_WIDGET_REFRESH_PUSH_INTERVAL_MS = 30 * 60 * 1000;
const DASHBOARD_TTL_MS = 24 * 60 * 60 * 1000;
const LOG_PREFIX = '[DASHBOARD-CACHE-WARMER]';

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function currentTradingWeekRange(now, timezone) {
  const endDate = getDateInTimezone(now, timezone, false);
  const weekday = getDayOfWeekInTimezone(now, timezone);
  const daysFromMonday = (weekday + 6) % 7;
  const localDateAtNoonUTC = new Date(`${endDate}T12:00:00.000Z`);
  localDateAtNoonUTC.setUTCDate(localDateAtNoonUTC.getUTCDate() - daysFromMonday);

  return {
    startDate: localDateAtNoonUTC.toISOString().slice(0, 10),
    endDate
  };
}

async function getRecommendationSummary(userId) {
  let statusCode = 200;
  const req = { user: { id: userId }, query: { summary: 'true' } };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      if (statusCode >= 400) {
        const error = new Error(payload?.error || 'Failed to warm recommendation summary');
        error.statusCode = statusCode;
        throw error;
      }
      return payload;
    }
  };

  return analyticsController.getRecommendationSummary(req, res, error => {
    throw error;
  });
}

class DashboardCacheWarmer extends IntervalScheduler {
  constructor() {
    const intervalMs = positiveInteger(
      process.env.DASHBOARD_CACHE_WARM_INTERVAL_MS,
      DEFAULT_INTERVAL_MS
    );
    super({
      intervalMs,
      initialDelayMs: positiveInteger(process.env.DASHBOARD_CACHE_WARM_INITIAL_DELAY_MS, 30_000),
      useUnref: true,
      guardRestart: true,
      messages: {
        startLogs: [`${LOG_PREFIX} Starting (every ${Math.round(intervalMs / 60_000)} minutes)`],
        started: `${LOG_PREFIX} Scheduler started`,
        stopping: `${LOG_PREFIX} Stopping...`,
        stopped: `${LOG_PREFIX} Stopped`,
        skip: `${LOG_PREFIX} Previous run still in progress, skipping`,
        runError: `${LOG_PREFIX} Run failed:`,
        initialError: `${LOG_PREFIX} Initial run failed:`,
        scheduledError: `${LOG_PREFIX} Scheduled run failed:`
      }
    });

    this.activeDays = positiveInteger(process.env.DASHBOARD_CACHE_WARM_ACTIVE_DAYS, DEFAULT_ACTIVE_DAYS);
    this.userLimit = positiveInteger(process.env.DASHBOARD_CACHE_WARM_USER_LIMIT, DEFAULT_USER_LIMIT);
    this.widgetRefreshPushIntervalMs = positiveInteger(
      process.env.WIDGET_REFRESH_PUSH_INTERVAL_MS,
      DEFAULT_WIDGET_REFRESH_PUSH_INTERVAL_MS
    );
    this.userOffset = 0;
    this.lastWidgetRefreshPushAt = new Map();
    this.lastSummary = null;
  }

  async getActiveUsers() {
    const result = await db.query(
      `SELECT u.id, COALESCE(NULLIF(u.timezone, ''), 'UTC') AS timezone
       FROM users u
       WHERE u.last_login_at >= NOW() - ($1::integer * INTERVAL '1 day')
         AND EXISTS (SELECT 1 FROM trades t WHERE t.user_id = u.id)
       ORDER BY u.last_login_at DESC
       LIMIT $2 OFFSET $3`,
      [this.activeDays, this.userLimit, this.userOffset]
    );
    this.userOffset = result.rows.length < this.userLimit
      ? 0
      : this.userOffset + result.rows.length;
    return result.rows;
  }

  async warmDashboard(user) {
    const filters = currentTradingWeekRange(new Date(), user.timezone || 'UTC');
    const cacheKey = TradeQueries.cacheKey(user.id, filters);

    let analytics = cache.get(cacheKey);
    if (!analytics) {
      analytics = await AnalyticsCache.get(user.id, cacheKey);
    }
    if (!analytics) {
      analytics = await TradeQueries.getAnalytics(user.id, filters);
      await AnalyticsCache.set(user.id, cacheKey, analytics, 24 * 60);
    }

    cache.set(cacheKey, analytics, DASHBOARD_TTL_MS);
    return cacheKey;
  }

  async wakeWidgetIfDue(userId, now = Date.now()) {
    const lastPushAt = this.lastWidgetRefreshPushAt.get(userId);
    if (lastPushAt !== undefined && now - lastPushAt < this.widgetRefreshPushIntervalMs) {
      return { attempted: false, delivered: false };
    }

    // Record before awaiting APNs so overlapping scheduler invocations cannot
    // send duplicate background pushes to the same device.
    this.lastWidgetRefreshPushAt.set(userId, now);

    try {
      const result = await pushNotificationService.sendBackgroundRefresh(
        userId,
        'dashboard_cache_warmed'
      );
      return {
        attempted: true,
        delivered: result.success === true,
        reason: result.reason || result.error
      };
    } catch (error) {
      return { attempted: true, delivered: false, reason: error.message };
    }
  }

  async execute() {
    const users = await this.getActiveUsers();
    const summary = {
      users: users.length,
      warmed: 0,
      errors: 0,
      refreshPushesAttempted: 0,
      refreshPushesDelivered: 0
    };

    // A small bounded batch prevents a restart from creating a burst of
    // expensive analytics and optional AI calls.
    for (let index = 0; index < users.length; index += 3) {
      const batch = users.slice(index, index + 3);
      const results = await Promise.allSettled(batch.map(async user => {
        await this.warmDashboard(user);
        await getRecommendationSummary(user.id);
        return this.wakeWidgetIfDue(user.id);
      }));

      for (const result of results) {
        if (result.status === 'fulfilled') {
          summary.warmed++;
          const refresh = await result.value;
          if (refresh.attempted) {
            summary.refreshPushesAttempted++;
            if (refresh.delivered) {
              summary.refreshPushesDelivered++;
            } else {
              console.warn(`${LOG_PREFIX} Widget refresh push not delivered: ${refresh.reason || 'unknown'}`);
            }
          }
        } else {
          summary.errors++;
          console.error(`${LOG_PREFIX} User warm failed:`, result.reason?.message || result.reason);
        }
      }
    }

    this.lastRunDate = new Date().toISOString();
    this.lastSummary = summary;
    console.log(
      `${LOG_PREFIX} Complete - warmed: ${summary.warmed}, errors: ${summary.errors}, ` +
      `widget pushes: ${summary.refreshPushesDelivered}/${summary.refreshPushesAttempted}`
    );
    return summary;
  }

  getStatus() {
    return { ...super.getStatus(), lastSummary: this.lastSummary };
  }
}

const dashboardCacheWarmer = new DashboardCacheWarmer();

module.exports = dashboardCacheWarmer;
module.exports.currentTradingWeekRange = currentTradingWeekRange;
module.exports.getRecommendationSummary = getRecommendationSummary;
