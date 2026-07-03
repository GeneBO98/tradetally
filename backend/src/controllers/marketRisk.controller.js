const marketRiskService = require('../services/marketRiskService');

// Indicators are macro-level public data (no user data involved), so this
// endpoint is unauthenticated and cacheable by proxies.
const CACHE_CONTROL = 'public, max-age=900, s-maxage=3600, stale-while-revalidate=86400';

const marketRiskController = {
  async getIndicators(req, res) {
    try {
      const payload = await marketRiskService.getIndicators();
      res.set('Cache-Control', CACHE_CONTROL);
      res.json(payload);
    } catch (error) {
      console.error('[MARKET-RISK] Failed to serve indicators:', error.message);
      res.status(503).json({ error: 'Market risk indicators are temporarily unavailable' });
    }
  }
};

module.exports = marketRiskController;
