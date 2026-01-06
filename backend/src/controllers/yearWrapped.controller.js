const YearWrappedService = require('../services/yearWrappedService');

const yearWrappedController = {

  /**
   * Get Year Wrapped data for a specific year
   * GET /api/year-wrapped/:year
   */
  async getYearWrapped(req, res, next) {
    try {
      const userId = req.user.id;
      const year = parseInt(req.params.year);

      if (isNaN(year) || year < 2000 || year > new Date().getFullYear()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid year parameter'
        });
      }

      const data = await YearWrappedService.getYearWrapped(userId, year);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('[YEAR_WRAPPED] Error getting year wrapped:', error);
      next(error);
    }
  },

  /**
   * Check if banner should be shown
   * GET /api/year-wrapped/banner-status
   */
  async getBannerStatus(req, res, next) {
    try {
      const userId = req.user.id;
      const status = await YearWrappedService.shouldShowBanner(userId);

      res.json({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('[YEAR_WRAPPED] Error getting banner status:', error);
      next(error);
    }
  },

  /**
   * Dismiss the banner for a specific year
   * POST /api/year-wrapped/:year/dismiss
   */
  async dismissBanner(req, res, next) {
    try {
      const userId = req.user.id;
      const year = parseInt(req.params.year);

      if (isNaN(year)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid year parameter'
        });
      }

      await YearWrappedService.dismissBanner(userId, year);

      res.json({
        success: true,
        message: 'Banner dismissed successfully'
      });
    } catch (error) {
      console.error('[YEAR_WRAPPED] Error dismissing banner:', error);
      next(error);
    }
  },

  /**
   * Mark Year Wrapped as viewed
   * POST /api/year-wrapped/:year/viewed
   */
  async markAsViewed(req, res, next) {
    try {
      const userId = req.user.id;
      const year = parseInt(req.params.year);

      if (isNaN(year)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid year parameter'
        });
      }

      await YearWrappedService.markAsViewed(userId, year);

      res.json({
        success: true,
        message: 'Marked as viewed successfully'
      });
    } catch (error) {
      console.error('[YEAR_WRAPPED] Error marking as viewed:', error);
      next(error);
    }
  },

  /**
   * Force regenerate Year Wrapped data (useful for testing)
   * POST /api/year-wrapped/:year/regenerate
   */
  async regenerate(req, res, next) {
    try {
      const userId = req.user.id;
      const year = parseInt(req.params.year);

      if (isNaN(year) || year < 2000 || year > new Date().getFullYear()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid year parameter'
        });
      }

      const data = await YearWrappedService.getYearWrapped(userId, year, true);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('[YEAR_WRAPPED] Error regenerating year wrapped:', error);
      next(error);
    }
  }
};

module.exports = yearWrappedController;
