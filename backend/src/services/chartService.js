const TierService = require('./tierService');
const finnhub = require('../utils/finnhub');
const alphaVantage = require('../utils/alphaVantage');

class ChartService {
  // Get chart data for a trade
  // When billing is enabled (tradetally.io): Finnhub only, Pro users only
  // When billing is disabled (self-hosted): Finnhub preferred, Alpha Vantage fallback, all users
  static async getTradeChartData(userId, symbol, entryDate, exitDate = null, hostHeader = null) {
    try {
      // Check user tier and billing status
      const userTier = await TierService.getUserTier(userId, hostHeader);
      const isProUser = userTier === 'pro';
      const billingEnabled = await TierService.isBillingEnabled(hostHeader);

      console.log(`Getting chart data for user ${userId}, tier: ${userTier || 'free'}, symbol: ${symbol}, billingEnabled: ${billingEnabled}`);
      console.log('Chart data input:', { entryDate, exitDate });

      // When billing is enabled (tradetally.io): Charts are Pro-only, Finnhub only
      if (billingEnabled) {
        if (!isProUser) {
          const error = new Error('Trade charts are a Pro feature. Upgrade to Pro for high-precision candlestick charts.');
          error.statusCode = 403;
          throw error;
        }

        if (!finnhub.isConfigured()) {
          throw new Error('Chart service is not configured. Please contact support.');
        }

        console.log('Using Finnhub for Pro user chart data (billing enabled)');
        return await finnhub.getTradeChartData(symbol, entryDate, exitDate, userId);
      }

      // Self-hosted mode: Finnhub preferred with Alpha Vantage fallback
      if (isProUser && finnhub.isConfigured()) {
        console.log('Using Finnhub for chart data (self-hosted)');
        try {
          return await finnhub.getTradeChartData(symbol, entryDate, exitDate, userId);
        } catch (error) {
          console.warn(`Finnhub failed for symbol ${symbol}: ${error.message}`);

          // Fall back to Alpha Vantage if configured
          if (alphaVantage.isConfigured()) {
            console.warn(`Falling back to Alpha Vantage due to Finnhub failure (${error.message})`);
            try {
              const chartData = await alphaVantage.getTradeChartData(symbol, entryDate, exitDate);
              chartData.source = 'alphavantage';
              chartData.fallback = true;
              chartData.fallbackReason = 'Finnhub unavailable';
              return chartData;
            } catch (avError) {
              console.error(`Alpha Vantage fallback also failed for ${symbol}: ${avError.message}`);
              if (avError.message.includes('503') || avError.message.includes('timeout') || avError.message.includes('unavailable')) {
                throw new Error(`Chart services are temporarily unavailable. Please try again later.`);
              }
              throw new Error(`Chart data unavailable for ${symbol}. This symbol may be delisted, inactive, or not supported. Please try a different symbol like AAPL, MSFT, or GOOGL.`);
            }
          }

          throw new Error(`Chart data unavailable for ${symbol}. This symbol may be delisted, inactive, or not supported by Finnhub. Please try a different symbol like AAPL, MSFT, or GOOGL.`);
        }
      }

      // Self-hosted: Finnhub not configured, use Alpha Vantage
      if (alphaVantage.isConfigured()) {
        console.log('Using Alpha Vantage for chart data (self-hosted)');
        const chartData = await alphaVantage.getTradeChartData(symbol, entryDate, exitDate);
        chartData.source = 'alphavantage';
        return chartData;
      }

      // Neither service is configured
      throw new Error('No chart data provider is configured. Please configure either Finnhub or Alpha Vantage API keys.');

    } catch (error) {
      console.error(`Failed to get chart data for ${symbol}:`, error);
      throw error;
    }
  }
  
  // Get service availability status
  static async getServiceStatus(hostHeader = null) {
    const billingEnabled = await TierService.isBillingEnabled(hostHeader);
    const status = {
      finnhub: {
        configured: finnhub.isConfigured(),
        description: billingEnabled ? 'Finnhub API - Pro charts' : 'Finnhub API - Premium charts with intraday data'
      }
    };

    // Only expose Alpha Vantage status for self-hosted
    if (!billingEnabled) {
      status.alphaVantage = {
        configured: alphaVantage.isConfigured(),
        description: 'Alpha Vantage API - Daily chart data (self-hosted fallback)'
      };
    }

    return status;
  }

  // Get usage statistics for chart services
  static async getUsageStats(userId, hostHeader = null) {
    const userTier = await TierService.getUserTier(userId, hostHeader);
    const isProUser = userTier === 'pro';
    const billingEnabled = await TierService.isBillingEnabled(hostHeader);

    const stats = {
      userTier: userTier || 'free',
      preferredService: 'finnhub'
    };

    // Add Finnhub stats
    if (finnhub.isConfigured()) {
      stats.finnhub = {
        configured: true,
        rateLimitPerMinute: 150,
        rateLimitPerSecond: 30
      };
    }

    // Only include Alpha Vantage stats for self-hosted instances
    if (!billingEnabled && !isProUser && alphaVantage.isConfigured()) {
      stats.preferredService = 'alphavantage';
      try {
        stats.alphaVantage = await alphaVantage.getUsageStats();
      } catch (error) {
        console.warn('Failed to get Alpha Vantage usage stats:', error.message);
      }
    }

    return stats;
  }
}

module.exports = ChartService;
