const NewsCorrelationService = require('../services/newsCorrelationService');
const logger = require('../utils/logger');

class NewsCorrelationController {
  /**
   * Get comprehensive news sentiment correlation analytics
   */
  async getCorrelationAnalytics(req, res) {
    try {
      const userId = req.user.id;
      const { 
        startDate, 
        endDate, 
        symbol, 
        sector 
      } = req.query;

      const analytics = await NewsCorrelationService.getNewsCorrelationAnalytics(userId, {
        startDate,
        endDate,
        symbol,
        sector
      });

      if (analytics.error) {
        return res.status(403).json({ error: analytics.error });
      }

      res.json(analytics);
    } catch (error) {
      logger.logError(`Error in getCorrelationAnalytics: ${error.message}`);
      res.status(500).json({ error: 'Failed to get news correlation analytics' });
    }
  }

  /**
   * Get news correlation summary for dashboard
   */
  async getCorrelationSummary(req, res) {
    try {
      const userId = req.user.id;

      const summary = await NewsCorrelationService.getNewsCorrelationSummary(userId);
      
      if (!summary) {
        return res.json({ 
          enabled: false, 
          message: 'Insufficient data or feature not available' 
        });
      }

      res.json({
        enabled: true,
        data: summary
      });
    } catch (error) {
      logger.logError(`Error in getCorrelationSummary: ${error.message}`);
      res.status(500).json({ error: 'Failed to get news correlation summary' });
    }
  }

  /**
   * Check if news correlation analytics is enabled for user
   */
  async checkEnabled(req, res) {
    try {
      const userId = req.user.id;
      const enabled = await NewsCorrelationService.isNewsCorrelationEnabled(userId);
      
      res.json({ enabled });
    } catch (error) {
      logger.logError(`Error in checkEnabled: ${error.message}`);
      res.status(500).json({ error: 'Failed to check feature availability' });
    }
  }
}

module.exports = new NewsCorrelationController();