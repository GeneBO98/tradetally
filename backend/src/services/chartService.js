const TierService = require('./tierService');
const finnhub = require('../utils/finnhub');
const alphaVantage = require('../utils/alphaVantage');

class ChartService {
  // Get chart data for a trade, using Finnhub for Pro users and Alpha Vantage for free users
  static async getTradeChartData(userId, symbol, entryDate, exitDate = null) {
    try {
      // Check user tier
      const userTier = await TierService.getUserTier(userId);
      const isProUser = userTier && userTier.tier_name === 'pro';
      
      console.log(`Getting chart data for user ${userId}, tier: ${userTier?.tier_name || 'free'}, symbol: ${symbol}`);
      
      // Pro users get Finnhub data (higher quality, more frequent updates)
      if (isProUser && finnhub.isConfigured()) {
        console.log('Using Finnhub for Pro user chart data');
        try {
          return await finnhub.getTradeChartData(symbol, entryDate, exitDate);
        } catch (error) {
          console.warn('Finnhub chart data failed, falling back to Alpha Vantage:', error.message);
          // Fallback to Alpha Vantage if Finnhub fails
          if (alphaVantage.isConfigured()) {
            const chartData = await alphaVantage.getTradeChartData(symbol, entryDate, exitDate);
            chartData.source = 'alphavantage_fallback';
            return chartData;
          }
          throw error;
        }
      }
      
      // Free users or when Finnhub is not configured - use Alpha Vantage
      if (alphaVantage.isConfigured()) {
        console.log('Using Alpha Vantage for chart data');
        const chartData = await alphaVantage.getTradeChartData(symbol, entryDate, exitDate);
        chartData.source = 'alphavantage';
        return chartData;
      }
      
      // Neither service is configured
      throw new Error('No chart data provider is configured. Please configure either Finnhub (Pro) or Alpha Vantage API keys.');
      
    } catch (error) {
      console.error(`Failed to get chart data for ${symbol}:`, error);
      throw error;
    }
  }
  
  // Get service availability status
  static async getServiceStatus() {
    return {
      finnhub: {
        configured: finnhub.isConfigured(),
        description: 'Finnhub API - Premium charts for Pro users'
      },
      alphaVantage: {
        configured: alphaVantage.isConfigured(),
        description: 'Alpha Vantage API - Basic charts for free users'
      }
    };
  }
  
  // Get usage statistics for chart services
  static async getUsageStats(userId) {
    const userTier = await TierService.getUserTier(userId);
    const isProUser = userTier && userTier.tier_name === 'pro';
    
    const stats = {
      userTier: userTier?.tier_name || 'free',
      preferredService: isProUser && finnhub.isConfigured() ? 'finnhub' : 'alphavantage'
    };
    
    // Add Alpha Vantage usage stats if configured
    if (alphaVantage.isConfigured()) {
      try {
        stats.alphaVantage = await alphaVantage.getUsageStats();
      } catch (error) {
        console.warn('Failed to get Alpha Vantage usage stats:', error.message);
      }
    }
    
    // Add Finnhub stats if needed (Finnhub doesn't have usage limits in the same way)
    if (finnhub.isConfigured()) {
      stats.finnhub = {
        configured: true,
        rateLimitPerMinute: 60,
        description: 'Finnhub API - 60 calls per minute'
      };
    }
    
    return stats;
  }
}

module.exports = ChartService;