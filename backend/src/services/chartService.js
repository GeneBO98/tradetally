const TierService = require('./tierService');
const finnhub = require('../utils/finnhub');
const alphaVantage = require('../utils/alphaVantage');
const axios = require('axios');

class ChartService {
  // Get crypto chart data from CoinGecko for a trade's date range
  static async getCryptoTradeChartData(symbol, entryDate, exitDate = null) {
    const symbolUpper = symbol.toUpperCase();
    const coinGeckoId = finnhub.constructor.CRYPTO_TO_COINGECKO[symbolUpper];

    if (!coinGeckoId) {
      throw new Error(`Unknown crypto symbol: ${symbolUpper}. CoinGecko mapping not found.`);
    }

    const entryTime = new Date(entryDate);
    const exitTime = exitDate ? new Date(exitDate) : new Date();

    // Calculate days from entry to exit (minimum 1 day, add padding)
    const durationMs = exitTime - entryTime;
    const durationDays = Math.max(1, Math.ceil(durationMs / (24 * 60 * 60 * 1000)));
    // Add padding: 2 days before entry, 2 days after exit (or up to today)
    const days = durationDays + 4;

    console.log(`[CRYPTO-CHART] Fetching CoinGecko chart for ${symbolUpper} (${coinGeckoId}), ${days} days`);

    const headers = { 'Accept': 'application/json' };
    const apiKey = process.env.COINGECKO_API_KEY;
    if (apiKey) {
      headers['x-cg-demo-api-key'] = apiKey;
    }

    const response = await axios.get(
      `https://api.coingecko.com/api/v3/coins/${coinGeckoId}/market_chart?vs_currency=usd&days=${days}`,
      { timeout: 15000, headers }
    );

    const prices = response.data.prices || [];
    const candles = prices.map(([timestamp, price]) => ({
      time: Math.floor(timestamp / 1000),
      open: price,
      high: price,
      low: price,
      close: price
    }));

    console.log(`[CRYPTO-CHART] Got ${candles.length} data points for ${symbolUpper}`);

    return {
      type: 'daily',
      interval: 'daily',
      candles,
      source: 'coingecko'
    };
  }

  // Get chart data for a trade
  // When billing is enabled (tradetally.io): Finnhub only, Pro users only
  // When billing is disabled (self-hosted): Finnhub preferred, Alpha Vantage fallback, all users
  static async getTradeChartData(userId, symbol, entryDate, exitDate = null, hostHeader = null) {
    try {
      // Crypto symbols always use CoinGecko regardless of tier/billing
      if (finnhub.isCryptoSymbol(symbol)) {
        console.log(`[CHART] ${symbol} is crypto, using CoinGecko`);
        return await ChartService.getCryptoTradeChartData(symbol, entryDate, exitDate);
      }

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
