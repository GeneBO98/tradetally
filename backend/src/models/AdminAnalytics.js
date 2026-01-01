const db = require('../config/database');

class AdminAnalytics {
  /**
   * Get summary statistics for the admin analytics dashboard
   * @param {string} startDate - ISO date string for period start
   * @returns {Object} Summary statistics
   */
  static async getSummary(startDate) {
    // Calculate today's start in server timezone to avoid CURRENT_DATE timezone mismatch
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();

    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStart = sevenDaysAgo.toISOString();

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStart = thirtyDaysAgo.toISOString();

    const query = `
      SELECT
        (SELECT COUNT(*) FROM users WHERE is_active = true) as total_users,
        (SELECT COUNT(*) FROM users WHERE created_at >= $1 AND is_active = true) as new_signups,
        (SELECT COUNT(*) FROM users WHERE last_login_at >= $2 AND is_active = true) as active_today,
        (SELECT COUNT(*) FROM users WHERE last_login_at >= $3 AND is_active = true) as active_7_days,
        (SELECT COUNT(*) FROM users WHERE last_login_at >= $4 AND is_active = true) as active_30_days,
        (SELECT COALESCE(SUM(trades_imported), 0) FROM import_logs WHERE created_at >= $1 AND status = 'completed') as trades_imported,
        (SELECT COUNT(*) FROM import_logs WHERE created_at >= $1 AND status = 'completed') as import_count,
        (SELECT COALESCE(SUM(call_count), 0) FROM api_usage_tracking WHERE created_at >= $1) as api_calls,
        (SELECT COUNT(*) FROM trades WHERE created_at >= $1) as trades_created
    `;

    const result = await db.query(query, [startDate, todayStart, sevenDaysAgoStart, thirtyDaysAgoStart]);
    const row = result.rows[0];

    return {
      totalUsers: parseInt(row.total_users) || 0,
      newSignups: parseInt(row.new_signups) || 0,
      activeToday: parseInt(row.active_today) || 0,
      active7Days: parseInt(row.active_7_days) || 0,
      active30Days: parseInt(row.active_30_days) || 0,
      tradesImported: parseInt(row.trades_imported) || 0,
      importCount: parseInt(row.import_count) || 0,
      apiCalls: parseInt(row.api_calls) || 0,
      tradesCreated: parseInt(row.trades_created) || 0
    };
  }

  /**
   * Get daily signup trend data
   * @param {string} startDate - ISO date string for period start
   * @returns {Array} Daily signup counts
   */
  static async getSignupTrend(startDate) {
    const query = `
      SELECT
        DATE_TRUNC('day', created_at)::date as date,
        COUNT(*) as count
      FROM users
      WHERE created_at >= $1 AND is_active = true
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `;

    const result = await db.query(query, [startDate]);
    return result.rows.map(row => ({
      date: row.date,
      count: parseInt(row.count) || 0
    }));
  }

  /**
   * Get daily login activity trend data
   * @param {string} startDate - ISO date string for period start
   * @returns {Array} Daily unique login counts
   */
  static async getLoginTrend(startDate) {
    const query = `
      SELECT
        DATE_TRUNC('day', last_login_at)::date as date,
        COUNT(DISTINCT id) as unique_users
      FROM users
      WHERE last_login_at >= $1 AND is_active = true
      GROUP BY DATE_TRUNC('day', last_login_at)
      ORDER BY date ASC
    `;

    const result = await db.query(query, [startDate]);
    return result.rows.map(row => ({
      date: row.date,
      uniqueUsers: parseInt(row.unique_users) || 0
    }));
  }

  /**
   * Get daily import trend data
   * @param {string} startDate - ISO date string for period start
   * @returns {Array} Daily import counts and trades imported
   */
  static async getImportTrend(startDate) {
    const query = `
      SELECT
        DATE_TRUNC('day', created_at)::date as date,
        COUNT(*) as count,
        COALESCE(SUM(trades_imported), 0) as trades_count
      FROM import_logs
      WHERE created_at >= $1 AND status = 'completed'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY date ASC
    `;

    const result = await db.query(query, [startDate]);
    return result.rows.map(row => ({
      date: row.date,
      count: parseInt(row.count) || 0,
      tradesCount: parseInt(row.trades_count) || 0
    }));
  }

  /**
   * Get daily API usage trend data by endpoint type
   * @param {string} startDate - ISO date string for period start
   * @returns {Array} Daily API call counts by endpoint type
   */
  static async getApiUsageTrend(startDate) {
    const query = `
      SELECT
        usage_date as date,
        endpoint_type,
        COALESCE(SUM(call_count), 0) as call_count
      FROM api_usage_tracking
      WHERE created_at >= $1
      GROUP BY usage_date, endpoint_type
      ORDER BY usage_date ASC, endpoint_type
    `;

    const result = await db.query(query, [startDate]);

    // Group by date with endpoint breakdowns
    const grouped = {};
    for (const row of result.rows) {
      const dateStr = row.date.toISOString().split('T')[0];
      if (!grouped[dateStr]) {
        grouped[dateStr] = { date: dateStr, quote: 0, candle: 0, indicator: 0, pattern: 0, support_resistance: 0, total: 0 };
      }
      const count = parseInt(row.call_count) || 0;
      grouped[dateStr][row.endpoint_type] = count;
      grouped[dateStr].total += count;
    }

    return Object.values(grouped);
  }

  /**
   * Get broker sync statistics
   * @param {string} startDate - ISO date string for period start
   * @returns {Object} Broker sync statistics
   */
  static async getBrokerSyncStats(startDate) {
    // Debug: Log the date being used
    console.log('[ADMIN-ANALYTICS] Broker sync stats query - startDate:', startDate);
    console.log('[ADMIN-ANALYTICS] Server time:', new Date().toISOString());
    console.log('[ADMIN-ANALYTICS] Server timezone:', Intl.DateTimeFormat().resolvedOptions().timeZone);

    const query = `
      SELECT
        COUNT(*) as total_syncs,
        COUNT(*) FILTER (WHERE status = 'completed') as successful_syncs,
        COUNT(*) FILTER (WHERE status = 'failed') as failed_syncs,
        COALESCE(SUM(trades_imported), 0) as trades_imported,
        COALESCE(SUM(trades_skipped), 0) as trades_skipped
      FROM broker_sync_logs
      WHERE created_at >= $1
    `;

    const result = await db.query(query, [startDate]);
    const row = result.rows[0];

    // Debug: Log the results
    console.log('[ADMIN-ANALYTICS] Broker sync stats result:', row);

    // Also log total count without date filter for debugging
    const totalQuery = `SELECT COUNT(*) as total FROM broker_sync_logs`;
    const totalResult = await db.query(totalQuery);
    console.log('[ADMIN-ANALYTICS] Total broker_sync_logs (all time):', totalResult.rows[0].total);

    return {
      totalSyncs: parseInt(row.total_syncs) || 0,
      successfulSyncs: parseInt(row.successful_syncs) || 0,
      failedSyncs: parseInt(row.failed_syncs) || 0,
      tradesImported: parseInt(row.trades_imported) || 0,
      tradesSkipped: parseInt(row.trades_skipped) || 0
    };
  }

  /**
   * Get all analytics data for a given period
   * @param {string} period - Period identifier (today, 7d, 30d, 90d, all)
   * @returns {Object} Complete analytics data
   */
  static async getAnalytics(period = '30d') {
    const startDate = this.getStartDate(period);

    const [summary, signupTrend, loginTrend, importTrend, apiUsageTrend, brokerSyncStats] = await Promise.all([
      this.getSummary(startDate),
      this.getSignupTrend(startDate),
      this.getLoginTrend(startDate),
      this.getImportTrend(startDate),
      this.getApiUsageTrend(startDate),
      this.getBrokerSyncStats(startDate)
    ]);

    return {
      period,
      startDate,
      summary,
      trends: {
        signups: signupTrend,
        logins: loginTrend,
        imports: importTrend,
        apiUsage: apiUsageTrend
      },
      brokerSync: brokerSyncStats
    };
  }

  /**
   * Calculate the start date for a given period
   * @param {string} period - Period identifier
   * @returns {string} ISO date string
   */
  static getStartDate(period) {
    const now = new Date();

    switch (period) {
      case 'today':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      case '7d':
        const week = new Date(now);
        week.setDate(week.getDate() - 7);
        return week.toISOString();
      case '30d':
        const month = new Date(now);
        month.setDate(month.getDate() - 30);
        return month.toISOString();
      case '90d':
        const quarter = new Date(now);
        quarter.setDate(quarter.getDate() - 90);
        return quarter.toISOString();
      case 'all':
        return new Date('2020-01-01').toISOString();
      default:
        const defaultPeriod = new Date(now);
        defaultPeriod.setDate(defaultPeriod.getDate() - 30);
        return defaultPeriod.toISOString();
    }
  }
}

module.exports = AdminAnalytics;
