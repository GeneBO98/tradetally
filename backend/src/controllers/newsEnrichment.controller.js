const newsEnrichmentService = require('../services/newsEnrichmentService');
const jobQueue = require('../utils/jobQueue');
const logger = require('../utils/logger');

const newsEnrichmentController = {
  /**
   * Get news enrichment statistics
   */
  async getStats(req, res, next) {
    try {
      const includeGlobal = ['admin', 'owner'].includes(req.user.role);
      const stats = await newsEnrichmentService.getStats(req.user.id, includeGlobal);
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
      const requestedUserId = req.body.user_id || req.body.userId || req.user.id;
      const batchSize = req.body.batch_size ?? req.body.batchSize ?? 50;
      const maxTrades = req.body.max_trades ?? req.body.maxTrades ?? null;

      if (requestedUserId !== req.user.id && !['admin', 'owner'].includes(req.user.role)) {
        return res.status(403).json({ error: 'Admin access is required to backfill another user' });
      }
      
      // Queue the backfill job to process in background
      const jobId = await jobQueue.addJob('news_backfill', {
        userId: requestedUserId,
        batchSize,
        maxTrades
      }, 2); // Priority 2 (higher than default)

      logger.logImport(`Queued news backfill job ${jobId} for user ${requestedUserId}`);

      res.json({
        message: 'News backfill job started',
        jobId: jobId,
        details: {
          userId: requestedUserId,
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
