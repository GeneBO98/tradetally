const AdminAnalytics = require('../models/AdminAnalytics');
const { getUserTimezone } = require('../utils/timezone');

const adminAnalyticsController = {
  /**
   * Get admin analytics dashboard data
   * GET /api/admin/analytics?period=30d
   */
  async getAnalytics(req, res, next) {
    try {
      const { period = '30d' } = req.query;

      // Validate period parameter
      const validPeriods = ['today', '7d', '30d', '90d', 'all'];
      if (!validPeriods.includes(period)) {
        return res.status(400).json({
          error: `Invalid period. Must be one of: ${validPeriods.join(', ')}`
        });
      }

      // Use admin's timezone if available, otherwise default to CST for system-wide analytics
      const timezone = req.user?.timezone || 'America/Chicago';
      const analytics = await AdminAnalytics.getAnalytics(period, timezone);

      res.json(analytics);
    } catch (error) {
      console.error('[ERROR] Failed to fetch admin analytics:', error);
      next(error);
    }
  },

  /**
   * Get summary statistics only
   * GET /api/admin/analytics/summary?period=30d
   */
  async getSummary(req, res, next) {
    try {
      const { period = '30d' } = req.query;
      // Use admin's timezone if available, otherwise default to CST for system-wide analytics
      const timezone = req.user?.timezone || 'America/Chicago';
      const startDate = AdminAnalytics.getStartDate(period, timezone);
      const summary = await AdminAnalytics.getSummary(startDate, timezone);

      res.json({
        period,
        startDate,
        summary
      });
    } catch (error) {
      console.error('[ERROR] Failed to fetch admin analytics summary:', error);
      next(error);
    }
  },

  /**
   * Get signup trend data
   * GET /api/admin/analytics/trends/signups?period=30d
   */
  async getSignupTrend(req, res, next) {
    try {
      const { period = '30d' } = req.query;
      const timezone = req.user?.timezone || 'America/Chicago';
      const startDate = AdminAnalytics.getStartDate(period, timezone);
      const trend = await AdminAnalytics.getSignupTrend(startDate);

      res.json({
        period,
        startDate,
        data: trend
      });
    } catch (error) {
      console.error('[ERROR] Failed to fetch signup trend:', error);
      next(error);
    }
  },

  /**
   * Get login activity trend data
   * GET /api/admin/analytics/trends/logins?period=30d
   */
  async getLoginTrend(req, res, next) {
    try {
      const { period = '30d' } = req.query;
      const timezone = req.user?.timezone || 'America/Chicago';
      const startDate = AdminAnalytics.getStartDate(period, timezone);
      const trend = await AdminAnalytics.getLoginTrend(startDate);

      res.json({
        period,
        startDate,
        data: trend
      });
    } catch (error) {
      console.error('[ERROR] Failed to fetch login trend:', error);
      next(error);
    }
  },

  /**
   * Get import trend data
   * GET /api/admin/analytics/trends/imports?period=30d
   */
  async getImportTrend(req, res, next) {
    try {
      const { period = '30d' } = req.query;
      const timezone = req.user?.timezone || 'America/Chicago';
      const startDate = AdminAnalytics.getStartDate(period, timezone);
      const trend = await AdminAnalytics.getImportTrend(startDate);

      res.json({
        period,
        startDate,
        data: trend
      });
    } catch (error) {
      console.error('[ERROR] Failed to fetch import trend:', error);
      next(error);
    }
  },

  /**
   * Get API usage trend data
   * GET /api/admin/analytics/trends/api-usage?period=30d
   */
  async getApiUsageTrend(req, res, next) {
    try {
      const { period = '30d' } = req.query;
      const timezone = req.user?.timezone || 'America/Chicago';
      const startDate = AdminAnalytics.getStartDate(period, timezone);
      const trend = await AdminAnalytics.getApiUsageTrend(startDate);

      res.json({
        period,
        startDate,
        data: trend
      });
    } catch (error) {
      console.error('[ERROR] Failed to fetch API usage trend:', error);
      next(error);
    }
  }
};

module.exports = adminAnalyticsController;
