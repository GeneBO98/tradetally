const TierService = require('./tierService');
const finnhub = require('../utils/finnhub');
const alphaVantage = require('../utils/alphaVantage');
const databento = require('../utils/databento');
const yahooFinance = require('../utils/yahooFinance');
const replayDataService = require('./replayDataService');
const axios = require('axios');
const { resolvePriceScale, applyPriceScale } = require('../utils/candlePriceScale');
const { getFuturesPointValue, getFuturesTickSize } = require('../utils/futuresUtils');

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toEpochSeconds(value) {
  if (!value) return null;
  if (value instanceof Date) return Math.floor(value.getTime() / 1000);
  if (typeof value === 'number') return Math.floor(value > 1e12 ? value / 1000 : value);
  const stringValue = String(value).trim().replace(' ', 'T');
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(stringValue);
  const milliseconds = Date.parse(hasOffset ? stringValue : `${stringValue}Z`);
  return Number.isFinite(milliseconds) ? Math.floor(milliseconds / 1000) : null;
}

class ChartService {
  static async getFuturesTradeChartData(userId, trade, resolution, billingEnabled) {
    const futuresRoot = replayDataService.futuresRootForTrade(trade);
    if (!futuresRoot) {
      const error = new Error(`Could not determine the futures contract root for ${trade.symbol}`);
      error.statusCode = 422;
      throw error;
    }

    const providerErrors = [];

    // A configured provider always wins. At present FMP exposes an explicit
    // commodities/futures chart method; providers without that capability are
    // skipped rather than receiving an ambiguous root such as ES or CL.
    if (finnhub.isConfigured() && typeof finnhub.getFuturesTradeChartData === 'function') {
      try {
        const chartData = await finnhub.getFuturesTradeChartData(futuresRoot, trade, userId, resolution);
        chartData.tick_size = chartData.tick_size ?? trade.tick_size ?? getFuturesTickSize(futuresRoot);
        chartData.point_value = chartData.point_value ?? trade.point_value ?? getFuturesPointValue(futuresRoot);
        return chartData;
      } catch (error) {
        providerErrors.push(`${finnhub.displayName}: ${error.message}`);
        console.warn(`[CHART] ${finnhub.displayName} futures data unavailable for ${trade.symbol}: ${error.message}`);
      }
    }

    // Databento remains the preferred fallback when the operator configured it.
    if (databento.isConfigured()) {
      try {
        return await replayDataService.getFuturesTradeChartData(trade, resolution);
      } catch (error) {
        providerErrors.push(`Databento: ${error.message}`);
        console.warn(`[CHART] Databento futures data unavailable for ${trade.symbol}: ${error.message}`);
      }
    }

    // Yahoo is deliberately last and self-hosted-only: it provides a no-cost
    // continuous-contract chart without displacing configured paid providers.
    if (!billingEnabled && yahooFinance.isEnabled()) {
      try {
        return await yahooFinance.getFuturesTradeChartData(futuresRoot, trade, resolution);
      } catch (error) {
        providerErrors.push(`Yahoo Finance: ${error.message}`);
        console.warn(`[CHART] Yahoo Finance futures data unavailable for ${trade.symbol}: ${error.message}`);
      }
    }

    const detail = providerErrors.length ? ` ${providerErrors.join('; ')}` : '';
    const error = new Error(`No futures chart data provider could serve ${trade.symbol}.${detail}`);
    error.statusCode = providerErrors.length ? 404 : 503;
    throw error;
  }

  static alignCandlesToTradePrices(chartData, trade) {
    if (!chartData?.candles?.length || !trade) return chartData;

    const instrumentType = String(trade.instrument_type || 'stock').toLowerCase();
    if (instrumentType !== 'stock') {
      chartData.price_scale = 1;
      return chartData;
    }

    const fills = [];
    const entryTime = toEpochSeconds(trade.entry_time || trade.trade_date);
    const entryPrice = asNumber(trade.entry_price ?? trade.price);
    if (entryTime && entryPrice !== null) fills.push({ time: entryTime, price: entryPrice });

    const exitTime = toEpochSeconds(trade.exit_time);
    const exitPrice = asNumber(trade.exit_price);
    if (exitTime && exitPrice !== null) fills.push({ time: exitTime, price: exitPrice });

    const priceScale = resolvePriceScale(chartData.candles, fills);
    chartData.candles = applyPriceScale(chartData.candles, priceScale);
    chartData.price_scale = priceScale;
    return chartData;
  }

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
  // When billing is enabled (tradetally.io): Pro users only; configured
  // provider capabilities are preferred for every instrument type.
  // When billing is disabled (self-hosted): configured market data provider preferred, Alpha Vantage fallback, all users
  static async getTradeChartData(userId, symbol, entryDate, exitDate = null, hostHeader = null, resolution = '1', trade = null) {
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
      const isFutures = String(trade?.instrument_type || '').toLowerCase() === 'future';

      console.log(`Getting chart data for user ${userId}, tier: ${userTier || 'free'}, symbol: ${symbol}, billingEnabled: ${billingEnabled}`);
      console.log('Chart data input:', { entryDate, exitDate });

      if (billingEnabled && !isProUser) {
        const error = new Error('Trade charts are a Pro feature. Upgrade to Pro for high-precision candlestick charts.');
        error.statusCode = 403;
        throw error;
      }

      // Futures select by provider capability; configured sources are tried
      // before any no-cost fallback.
      if (isFutures) {
        console.log(`[CHART] ${symbol} is a future, selecting the best configured futures provider`);
        return ChartService.getFuturesTradeChartData(userId, trade, resolution, billingEnabled);
      }

      // Hosted stock/option charts use the configured equity provider.
      if (billingEnabled) {
        if (!finnhub.isConfigured()) {
          throw new Error('Chart service is not configured. Please contact support.');
        }

        console.log('Using Finnhub for Pro user chart data (billing enabled)');
        return await finnhub.getTradeChartData(symbol, entryDate, exitDate, userId, resolution);
      }

      // Self-hosted mode: configured provider preferred with Alpha Vantage fallback
      if (isProUser && finnhub.isConfigured()) {
        console.log(`Using ${finnhub.displayName} for chart data (self-hosted)`);
        try {
          return await finnhub.getTradeChartData(symbol, entryDate, exitDate, userId, resolution);
        } catch (error) {
          console.warn(`${finnhub.displayName} failed for symbol ${symbol}: ${error.message}`);

          // Fall back to Alpha Vantage if configured
          if (alphaVantage.isConfigured()) {
            console.warn(`Falling back to Alpha Vantage due to ${finnhub.displayName} failure (${error.message})`);
            try {
              const chartData = await alphaVantage.getTradeChartData(symbol, entryDate, exitDate);
              chartData.source = 'alphavantage';
              chartData.fallback = true;
              chartData.fallbackReason = `${finnhub.displayName} unavailable`;
              return chartData;
            } catch (avError) {
              console.error(`Alpha Vantage fallback also failed for ${symbol}: ${avError.message}`);
              if (avError.message.includes('503') || avError.message.includes('timeout') || avError.message.includes('unavailable')) {
                throw new Error(`Chart services are temporarily unavailable. Please try again later.`);
              }
              throw new Error(`Chart data unavailable for ${symbol}. This symbol may be delisted, inactive, or not supported. Please try a different symbol like AAPL, MSFT, or GOOGL.`);
            }
          }

          throw new Error(`Chart data unavailable for ${symbol}. This symbol may be delisted, inactive, or not supported by ${finnhub.displayName}. Please try a different symbol like AAPL, MSFT, or GOOGL.`);
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
      throw new Error(`No chart data provider is configured. Please configure ${finnhub.providerName === 'fmp' ? 'FMP' : 'Finnhub'} or Alpha Vantage API keys.`);

    } catch (error) {
      console.error(`Failed to get chart data for ${symbol}:`, error);
      throw error;
    }
  }
  
  // Get service availability status
  static async getServiceStatus(hostHeader = null) {
    const billingEnabled = await TierService.isBillingEnabled(hostHeader);
    const status = {
      marketData: {
        provider: finnhub.providerName || 'finnhub',
        configured: finnhub.isConfigured(),
        description: billingEnabled ? 'Finnhub API - Pro charts' : `${finnhub.displayName} API - Premium charts with intraday data`
      },
      finnhub: {
        configured: finnhub.isConfigured(),
        description: billingEnabled ? 'Finnhub API - Pro charts' : `${finnhub.displayName} API - Premium charts with intraday data`
      }
    };

    // Only expose Alpha Vantage status for self-hosted
    if (!billingEnabled) {
      status.alphaVantage = {
        configured: alphaVantage.isConfigured(),
        description: 'Alpha Vantage API - Daily chart data (self-hosted fallback)'
      };
      status.databento = {
        configured: databento.isConfigured(),
        description: 'Databento API - configured futures chart fallback using continuous contracts'
      };
      status.yahoo_finance = {
        configured: yahooFinance.isEnabled(),
        description: 'Yahoo Finance - no-cost self-hosted futures chart fallback'
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
      preferredService: finnhub.providerName || 'finnhub'
    };

    // Add market data provider stats
    if (finnhub.isConfigured()) {
      stats[finnhub.providerName || 'finnhub'] = {
        configured: true,
        rateLimitPerMinute: finnhub.maxCallsPerMinute,
        rateLimitPerSecond: finnhub.maxCallsPerSecond
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
