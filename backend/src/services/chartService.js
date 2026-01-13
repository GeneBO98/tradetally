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
      
      // Pro users get Finnhub data (higher quality, more frequent updates)
      if (isProUser && finnhub.isConfigured()) {
        console.log('Using Finnhub for Pro user chart data');
        try {
          return await finnhub.getTradeChartData(symbol, entryDate, exitDate, userId);
        } catch (error) {
          console.warn(`Finnhub failed for symbol ${symbol}: ${error.message}`);

          // Fall back to Alpha Vantage if configured
          if (alphaVantage.isConfigured()) {
            console.warn(`Falling back to Alpha Vantage for Pro user due to Finnhub failure (${error.message})`);
            try {
              const chartData = await alphaVantage.getTradeChartData(symbol, entryDate, exitDate);
              chartData.source = 'alphavantage';
              chartData.fallback = true;
              chartData.fallbackReason = 'Finnhub unavailable';
              return chartData;
            } catch (avError) {
              console.error(`Alpha Vantage fallback also failed for ${symbol}: ${avError.message}`);
              // Check if it's a service availability issue vs symbol issue
              if (avError.message.includes('503') || avError.message.includes('timeout') || avError.message.includes('unavailable')) {
                throw new Error(`Chart services are temporarily unavailable. Please try again later.`);
              }
              throw new Error(`Chart data unavailable for ${symbol}. This symbol may be delisted, inactive, or not supported. Please try a different symbol like AAPL, MSFT, or GOOGL.`);
            }
          }

          // No fallback available - throw error
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
        description: 'Finnhub API - Premium charts for Pro users with Alpha Vantage fallback'
      },
      alphaVantage: {
        configured: alphaVantage.isConfigured(),
        description: 'Alpha Vantage API - Charts for free users and fallback for Pro users'
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