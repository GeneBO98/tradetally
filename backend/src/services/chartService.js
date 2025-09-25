const TierService = require('./tierService');
const finnhub = require('../utils/finnhub');
const alphaVantage = require('../utils/alphaVantage');

class ChartService {
  // Get chart data for a trade, using Finnhub for Pro users and Alpha Vantage for free users
  static async getTradeChartData(userId, symbol, entryDate, exitDate = null) {
    try {
      // Check user tier
      const userTier = await TierService.getUserTier(userId);
      const isProUser = userTier === 'pro';
      
      console.log(`Getting chart data for user ${userId}, tier: ${userTier || 'free'}, symbol: ${symbol}`);
      console.log('Chart data input:', { entryDate, exitDate });
      console.log('[DEBUG] CHART SERVICE: EntryDate type and value:', typeof entryDate, entryDate);
      console.log('[DEBUG] CHART SERVICE: ExitDate type and value:', typeof exitDate, exitDate);
      
      // Pro users get Finnhub data exclusively (higher quality, more frequent updates)
      if (isProUser && finnhub.isConfigured()) {
        console.log('Using Finnhub exclusively for Pro user chart data');
        try {
          return await finnhub.getTradeChartData(symbol, entryDate, exitDate);
        } catch (error) {
          console.warn(`Finnhub failed for symbol ${symbol}: ${error.message}`);
          // For PRO users, if Finnhub fails, provide a helpful error message
          throw new Error(`Chart data unavailable for ${symbol}. This symbol may be delisted, inactive, or not supported by Finnhub. Please try a different symbol like AAPL, MSFT, or GOOGL.`);
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
        description: 'Finnhub API - Exclusive premium charts for Pro users (no fallback)'
      },
      alphaVantage: {
        configured: alphaVantage.isConfigured(),
        description: 'Alpha Vantage API - Charts for free users only'
      }
    };
  }
  
  // Get usage statistics for chart services
  static async getUsageStats(userId) {
    const userTier = await TierService.getUserTier(userId);
    const isProUser = userTier === 'pro';
    
    const stats = {
      userTier: userTier || 'free',
      preferredService: isProUser && finnhub.isConfigured() ? 'finnhub' : 'alphavantage'
    };
    
    // Add Alpha Vantage usage stats if configured and user is not pro
    if (!isProUser && alphaVantage.isConfigured()) {
      try {
        stats.alphaVantage = await alphaVantage.getUsageStats();
      } catch (error) {
        console.warn('Failed to get Alpha Vantage usage stats:', error.message);
      }
    }
    
    // Add Finnhub stats for Pro users
    if (finnhub.isConfigured()) {
      stats.finnhub = {
        configured: true,
        rateLimitPerMinute: 150,
        rateLimitPerSecond: 30,
        description: 'Finnhub API - 150 calls per minute, 30 calls per second (Pro users only)'
      };
    }
    
    return stats;
  }
}

module.exports = ChartService;