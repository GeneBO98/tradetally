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

  /**
   * Get detailed trades and news for a specific performer combination
   */
  async getPerformerDetails(req, res) {
    try {
      const userId = req.user.id;
      const { symbol, sentiment, side } = req.query;

      if (!symbol || !sentiment || !side) {
        return res.status(400).json({ error: 'Symbol, sentiment, and side are required' });
      }

      const details = await NewsCorrelationService.getPerformerDetails(userId, {
        symbol: symbol.toUpperCase(),
        sentiment,
        side
      });

      if (details.error) {
        return res.status(403).json({ error: details.error });
      }

      res.json(details);
    } catch (error) {
      logger.logError(`Error in getPerformerDetails: ${error.message}`);
      res.status(500).json({ error: 'Failed to get performer details' });
    }
  }
}

module.exports = new NewsCorrelationController();