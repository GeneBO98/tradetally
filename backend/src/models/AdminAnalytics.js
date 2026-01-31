const db = require('../config/database');

/**
 * Get midnight in a specific timezone for a given date
 * @param {string} timezone - Timezone identifier (e.g., 'America/Chicago', 'UTC', 'America/New_York')
 * @param {Date} date - The date to get midnight for (defaults to now)
 * @returns {Date} Date object representing midnight in the specified timezone (as UTC)
 */
function getMidnightInTimezone(timezone = 'America/Chicago', date = new Date()) {
  // Get the date string in the specified timezone (YYYY-MM-DD format)
  const formatter = new Intl.DateTimeFormat('en-CA', { 
    timeZone: timezone, 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  });
  const tzDateStr = formatter.format(date);
  const [year, month, day] = tzDateStr.split('-').map(Number);
  
  // Use a simple approach: create a date at a known UTC time and see what it is in the target timezone
  // Then adjust to find midnight in that timezone
  // Start with noon UTC (which is typically around midnight in most US timezones, accounting for DST)
  let testUTC = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  
  // Format this time in the target timezone to see what hour it is
  const tzFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  
  // Also get the date to check if we're on the right day
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  let formatted = tzFormatter.format(testUTC);
  let [hour, minute, second] = formatted.split(':').map(Number);
  let tzDate = dateFormatter.format(testUTC);
  
  // First, ensure we're on the correct date
  if (tzDate !== tzDateStr) {
    // Calculate how many days to adjust
    const targetDate = new Date(tzDateStr);
    const currentDate = new Date(tzDate);
    const daysDiff = Math.round((targetDate - currentDate) / (24 * 60 * 60 * 1000));
    testUTC = new Date(testUTC.getTime() + daysDiff * 24 * 60 * 60 * 1000);
    
    // Re-check date and time
    formatted = tzFormatter.format(testUTC);
    [hour, minute, second] = formatted.split(':').map(Number);
    tzDate = dateFormatter.format(testUTC);
  }
  
  // Now adjust to midnight (00:00:00) on the correct date
  if (hour !== 0 || minute !== 0 || second !== 0) {
    const totalMsToAdjust = hour * 60 * 60 * 1000 + minute * 60 * 1000 + second * 1000;
    testUTC = new Date(testUTC.getTime() - totalMsToAdjust);
    
    // Final verification
    formatted = tzFormatter.format(testUTC);
    [hour, minute, second] = formatted.split(':').map(Number);
    if (hour !== 0 || minute !== 0 || second !== 0) {
      // One more adjustment if needed
      const finalMs = hour * 60 * 60 * 1000 + minute * 60 * 1000 + second * 1000;
      testUTC = new Date(testUTC.getTime() - finalMs);
    }
  }
  
  return testUTC;
}

/**
 * Get midnight CST (America/Chicago) for a given date
 * @param {Date} date - The date to get midnight CST for (defaults to now)
 * @returns {Date} Date object representing midnight CST in UTC
 * @deprecated Use getMidnightInTimezone('America/Chicago', date) instead
 */
function getMidnightCST(date = new Date()) {
  return getMidnightInTimezone('America/Chicago', date);
}

class AdminAnalytics {
  /**
   * Get summary statistics for the admin analytics dashboard
   * @param {string} startDate - ISO date string for period start
   * @param {string} timezone - Timezone to use for "today" calculation (defaults to 'America/Chicago' for admin analytics)
   * @returns {Object} Summary statistics
   */
  static async getSummary(startDate, timezone = 'America/Chicago') {
    // Calculate today's start at midnight in the specified timezone to ensure consistent daily reset at 12 AM
    const today = getMidnightInTimezone(timezone);
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
        (SELECT COUNT(*) FROM trades WHERE created_at >= $1) as trades_created,
        (SELECT COUNT(*) FROM account_deletions WHERE deleted_at >= $1) as account_deletions,
        (SELECT COUNT(*) FROM account_deletions WHERE deleted_at >= $1 AND deletion_type = 'self') as self_deletions,
        (SELECT COUNT(*) FROM account_deletions WHERE deleted_at >= $1 AND deletion_type = 'admin') as admin_deletions
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
      tradesCreated: parseInt(row.trades_created) || 0,
      accountDeletions: parseInt(row.account_deletions) || 0,
      selfDeletions: parseInt(row.self_deletions) || 0,
      adminDeletions: parseInt(row.admin_deletions) || 0
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
   * Get daily account deletion trend data
   * @param {string} startDate - ISO date string for period start
   * @returns {Array} Daily deletion counts
   */
  static async getDeletionTrend(startDate) {
    const query = `
      SELECT
        DATE_TRUNC('day', deleted_at)::date as date,
        COUNT(*) as count,
        COUNT(*) FILTER (WHERE deletion_type = 'self') as self_deletions,
        COUNT(*) FILTER (WHERE deletion_type = 'admin') as admin_deletions
      FROM account_deletions
      WHERE deleted_at >= $1
      GROUP BY DATE_TRUNC('day', deleted_at)
      ORDER BY date ASC
    `;

    const result = await db.query(query, [startDate]);
    return result.rows.map(row => ({
      date: row.date,
      count: parseInt(row.count) || 0,
      selfDeletions: parseInt(row.self_deletions) || 0,
      adminDeletions: parseInt(row.admin_deletions) || 0
    }));
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
   * @param {string} timezone - Timezone to use for "today" calculation (defaults to 'America/Chicago' for admin analytics)
   * @returns {Object} Complete analytics data
   */
  static async getAnalytics(period = '30d', timezone = 'America/Chicago') {
    const startDate = this.getStartDate(period, timezone);

    const [summary, signupTrend, loginTrend, importTrend, apiUsageTrend, deletionTrend, brokerSyncStats] = await Promise.all([
      this.getSummary(startDate, timezone),
      this.getSignupTrend(startDate),
      this.getLoginTrend(startDate),
      this.getImportTrend(startDate),
      this.getApiUsageTrend(startDate),
      this.getDeletionTrend(startDate),
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
        apiUsage: apiUsageTrend,
        deletions: deletionTrend
      },
      brokerSync: brokerSyncStats
    };
  }

  /**
   * Calculate the start date for a given period
   * @param {string} period - Period identifier
   * @param {string} timezone - Timezone to use for "today" calculation (defaults to 'America/Chicago' for admin analytics)
   * @returns {string} ISO date string
   */
  static getStartDate(period, timezone = 'America/Chicago') {
    const today = getMidnightInTimezone(timezone);

    switch (period) {
      case 'today':
        return today.toISOString();
      case '7d':
        const week = new Date(today);
        week.setDate(week.getDate() - 7);
        return week.toISOString();
      case '30d':
        const month = new Date(today);
        month.setDate(month.getDate() - 30);
        return month.toISOString();
      case '90d':
        const quarter = new Date(today);
        quarter.setDate(quarter.getDate() - 90);
        return quarter.toISOString();
      case 'all':
        return new Date('2020-01-01').toISOString();
      default:
        const defaultPeriod = new Date(today);
        defaultPeriod.setDate(defaultPeriod.getDate() - 30);
        return defaultPeriod.toISOString();
    }
  }
}

module.exports = AdminAnalytics;
module.exports.getMidnightInTimezone = getMidnightInTimezone;
