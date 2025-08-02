const newsEnrichmentService = require('../services/newsEnrichmentService');
const jobQueue = require('../utils/jobQueue');
const logger = require('../utils/logger');

const newsEnrichmentController = {
  /**
   * Get news enrichment statistics
   */
  async getStats(req, res, next) {
    try {
      const stats = await newsEnrichmentService.getStats();
      res.json(stats);
    } catch (error) {
      logger.logError(`Error getting news enrichment stats: ${error.message}`);
      res.status(500).json({ error: 'Failed to get news enrichment statistics' });
    }
  },

  /**
   * Start news backfill for existing trades
   */
  async startBackfill(req, res, next) {
    try {
      const { userId, batchSize = 50, maxTrades = null } = req.body;
      
      // Queue the backfill job to process in background
      const jobId = await jobQueue.addJob('news_backfill', {
        userId: userId || req.user.id,
        batchSize,
        maxTrades
      }, 2); // Priority 2 (higher than default)

      logger.logImport(`Queued news backfill job ${jobId} for user ${userId || req.user.id}`);

      res.json({
        message: 'News backfill job started',
        jobId: jobId,
        details: {
          userId: userId || req.user.id,
          batchSize,
          maxTrades
        }
      });
    } catch (error) {
      logger.logError(`Error starting news backfill: ${error.message}`);
      res.status(500).json({ error: 'Failed to start news backfill' });
    }
  },

  /**
   * Get cached news for a specific symbol and date
   */
  async getCachedNews(req, res, next) {
    try {
      const { symbol, date } = req.params;
      
      const newsData = await newsEnrichmentService.getNewsForSymbolAndDate(symbol, date, req.user.id);
      
      res.json({
        symbol: symbol.toUpperCase(),
        date,
        hasNews: newsData.hasNews,
        newsEvents: newsData.newsEvents,
        sentiment: newsData.sentiment,
        fromCache: newsData.fromCache
      });
    } catch (error) {
      logger.logError(`Error getting cached news: ${error.message}`);
      res.status(500).json({ error: 'Failed to get news data' });
    }
  }
};

module.exports = newsEnrichmentController;