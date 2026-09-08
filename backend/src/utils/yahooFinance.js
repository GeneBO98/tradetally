const axios = require('axios');
const cache = require('./cache');
const { getFuturesPointValue, getFuturesTickSize } = require('./futuresUtils');
const { version: APP_VERSION } = require('../../package.json');

const USER_AGENT = `TradeTally/${APP_VERSION}`;
const DAY_MS = 24 * 60 * 60 * 1000;
const YAHOO_CHART_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];

// Index underlyings are quoted with a caret on Yahoo. Without this an option on
// XSP resolves to an unrelated ECN quote that returns zero bars.
const INDEX_SYMBOLS = {
  XSP: '^XSP',
  SPX: '^SPX',
  NDX: '^NDX',
  RUT: '^RUT',
  VIX: '^VIX',
  DJX: '^DJI',
  OEX: '^OEX'
};

// Yahoo suffixes an exchange after a dot (ISLN.L, BMW.DE) but writes share
// classes with a dash (BRK-B). Both look like "TICKER.X", so the suffix has to
// be checked against the exchange list before rewriting the separator.
const EXCHANGE_SUFFIXES = new Set([
  'L', 'DE', 'F', 'SG', 'MU', 'BE', 'DU', 'HM', 'HA', 'PA', 'AS', 'BR', 'LS', 'MI',
  'MC', 'SW', 'VI', 'ST', 'HE', 'CO', 'OL', 'IC', 'IR', 'AT', 'WA', 'PR', 'BD',
  'RG', 'VS', 'TL', 'TO', 'V', 'NE', 'CN', 'MX', 'SA', 'BA', 'SN', 'HK', 'SS',
  'SZ', 'T', 'KS', 'KQ', 'TW', 'TWO', 'NS', 'BO', 'AX', 'NZ', 'SI', 'JO', 'TA', 'IS'
]);
const RETRYABLE_NETWORK_CODES = new Set([
  'EAI_AGAIN', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNABORTED'
]);
const RETRY_DELAY_MS = 150;
const RESOLUTIONS = {
  '1': { yahoo_interval: '1m', interval: '1min' },
  '5': { yahoo_interval: '5m', interval: '5min' },
  '15': { yahoo_interval: '15m', interval: '15min' },
  '60': { yahoo_interval: '60m', interval: '1hour' },
  D: { yahoo_interval: '1d', interval: 'daily' }
};

// Context to keep either side of an equity trade, per resolution.
const INTRADAY_CONTEXT_MS = {
  '1': 2 * 60 * 60 * 1000,
  '5': 8 * 60 * 60 * 1000,
  '15': DAY_MS,
  '60': 3 * DAY_MS
};

const STOCK_DAILY_CONTEXT_DAYS_BEFORE = 180;
const STOCK_DAILY_CONTEXT_DAYS_AFTER = 30;

// Beyond these holding periods a resolution stops being readable (and asks
// Yahoo for more bars than it will return in one response).
const MAX_SPAN_MS = {
  '1': 5 * DAY_MS,
  '5': 40 * DAY_MS,
  '15': 40 * DAY_MS,
  '60': 300 * DAY_MS
};

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isRetryableNetworkError(error) {
  const code = error?.code || error?.cause?.code;
  return RETRYABLE_NETWORK_CODES.has(code) || error?.response?.status >= 500;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

class YahooFinanceClient {
  isEnabled() {
    return process.env.YAHOO_FINANCE_ENABLED !== 'false';
  }

  // Translate a ledger symbol into the ticker Yahoo actually serves.
  getYahooSymbol(symbol) {
    const raw = String(symbol || '').trim().toUpperCase();
    if (!raw) return raw;
    if (raw.startsWith('^')) return raw;
    if (INDEX_SYMBOLS[raw]) return INDEX_SYMBOLS[raw];

    const lastDot = raw.lastIndexOf('.');
    if (lastDot === -1) return raw;

    const suffix = raw.slice(lastDot + 1);
    if (EXCHANGE_SUFFIXES.has(suffix)) return raw;

    // A share class, not an exchange: BRK.B -> BRK-B.
    return `${raw.slice(0, lastDot)}-${suffix}`;
  }

  getContinuousSymbol(root) {
    return `${String(root).trim().toUpperCase()}=F`;
  }

  availableResolutions(entryDate) {
    const entryTime = toDate(entryDate);
    if (!entryTime) return ['D'];
    const ageDays = Math.max(0, (Date.now() - entryTime.getTime()) / DAY_MS);
    if (ageDays <= 30) return ['1', '5', '15', '60', 'D'];
    if (ageDays <= 60) return ['5', '15', '60', 'D'];
    return ['D'];
  }

  effectiveResolution(requestedResolution, entryDate) {
    const requested = Object.hasOwn(RESOLUTIONS, requestedResolution) ? requestedResolution : '1';
    const available = this.availableResolutions(entryDate);
    if (available.includes(requested)) return requested;
    if (requested === '1' && available.includes('5')) return '5';
    return 'D';
  }

  chartWindow(entryDate, exitDate, resolution, options = {}) {
    const entryTime = toDate(entryDate);
    if (!entryTime) throw new Error('Trade is missing entry time information');
    const exitTime = toDate(exitDate) || entryTime;

    // A daily equity chart needs enough history to show the setup that preceded
    // the trade, matching the context the Alpha Vantage path already uses.
    if (options.spanHoldingPeriod && resolution === 'D') {
      return {
        period1: Math.floor((entryTime.getTime() - STOCK_DAILY_CONTEXT_DAYS_BEFORE * DAY_MS) / 1000),
        period2: Math.floor(Math.min(
          Date.now(),
          Math.max(entryTime.getTime(), exitTime.getTime()) + STOCK_DAILY_CONTEXT_DAYS_AFTER * DAY_MS
        ) / 1000)
      };
    }

    // An equity position can be held for days, so its intraday window has to
    // reach the exit. The futures path keeps its single-session window.
    if (options.spanHoldingPeriod && resolution !== 'D') {
      const context = INTRADAY_CONTEXT_MS[resolution] ?? 12 * 60 * 60 * 1000;
      const openTrade = !toDate(exitDate);
      const end = openTrade ? Date.now() : exitTime.getTime() + context;
      return {
        period1: Math.floor((entryTime.getTime() - context) / 1000),
        period2: Math.floor(Math.min(Date.now(), end) / 1000)
      };
    }

    if (resolution === 'D') {
      return {
        period1: Math.floor((entryTime.getTime() - 30 * DAY_MS) / 1000),
        period2: Math.floor(Math.min(Date.now(), Math.max(entryTime, exitTime) + 10 * DAY_MS) / 1000)
      };
    }

    // A 24-hour window centered on entry covers a complete futures session
    // without requesting excessive minute data from the no-cost endpoint.
    return {
      period1: Math.floor((entryTime.getTime() - 12 * 60 * 60 * 1000) / 1000),
      period2: Math.floor(Math.min(Date.now(), entryTime.getTime() + 12 * 60 * 60 * 1000) / 1000)
    };
  }

  async fetchCandles(yahooSymbol, entryDate, exitDate, resolution, options = {}) {
    const config = RESOLUTIONS[resolution];
    const window = options.window || this.chartWindow(entryDate, exitDate, resolution, options);
    if (window.period2 <= window.period1) {
      throw new Error('Yahoo Finance chart window is not available yet');
    }

    // An open trade's window ends at "now", so the raw bounds would never
    // repeat and the cache would never hit. Round them to the bucket the TTL
    // already tolerates.
    const namespace = resolution === 'D' ? 'yahoo_chart_daily' : 'yahoo_chart_intraday';
    const bucketSeconds = resolution === 'D' ? 3600 : 900;
    const cacheKey = [
      yahooSymbol,
      config.yahoo_interval,
      Math.floor(window.period1 / bucketSeconds),
      Math.floor(window.period2 / bucketSeconds)
    ].join('_');

    const cached = await cache.get(namespace, cacheKey);
    if (cached) {
      return cached;
    }

    let response;
    let lastError;

    for (const hostname of YAHOO_CHART_HOSTS) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          response = await axios.get(
            `https://${hostname}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`,
            {
              timeout: 15000,
              headers: {
                Accept: 'application/json',
                'User-Agent': USER_AGENT
              },
              params: {
                interval: config.yahoo_interval,
                period1: window.period1,
                period2: window.period2,
                includePrePost: true,
                events: 'history'
              }
            }
          );
          break;
        } catch (error) {
          lastError = error;
          if (!isRetryableNetworkError(error)) throw error;
          if (attempt === 0) await delay(RETRY_DELAY_MS * (attempt + 1));
        }
      }
      if (response) break;
    }

    if (!response) {
      lastError.isTransientProviderFailure = true;
      throw lastError;
    }

    const result = response.data?.chart?.result?.[0];
    const providerError = response.data?.chart?.error;
    if (!result || providerError) {
      throw new Error(providerError?.description || `No Yahoo Finance data available for ${yahooSymbol}`);
    }
    const expectedInstrumentType = options.expectedInstrumentType || null;
    if (expectedInstrumentType && result.meta?.instrumentType && result.meta.instrumentType !== expectedInstrumentType) {
      throw new Error(`${yahooSymbol} did not resolve to a ${expectedInstrumentType.toLowerCase()} instrument`);
    }

    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0] || {};
    const candles = timestamps.map((time, index) => ({
      time: Number(time),
      open: asNumber(quote.open?.[index]),
      high: asNumber(quote.high?.[index]),
      low: asNumber(quote.low?.[index]),
      close: asNumber(quote.close?.[index]),
      volume: asNumber(quote.volume?.[index])
    })).filter((candle) => (
      Number.isFinite(candle.time) &&
      [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    ));

    if (!candles.length) {
      throw new Error(`No Yahoo Finance candles available for ${yahooSymbol}`);
    }

    await cache.set(namespace, cacheKey, candles);
    return candles;
  }

  async getFuturesTradeChartData(root, trade, requestedResolution = '1') {
    if (!this.isEnabled()) {
      throw new Error('Yahoo Finance futures fallback is disabled');
    }

    const yahooSymbol = this.getContinuousSymbol(root);
    const entryDate = trade.entry_time || trade.trade_date;
    const exitDate = trade.exit_time || null;
    let resolution = this.effectiveResolution(requestedResolution, entryDate);
    let fallbackReason = resolution !== requestedResolution
      ? `${requestedResolution}-minute data is outside Yahoo Finance retention`
      : null;
    let candles;
    const futuresOptions = { expectedInstrumentType: 'FUTURE' };

    try {
      candles = await this.fetchCandles(yahooSymbol, entryDate, exitDate, resolution, futuresOptions);
    } catch (error) {
      if (resolution === 'D') throw error;
      fallbackReason = error.message;
      resolution = 'D';
      candles = await this.fetchCandles(yahooSymbol, entryDate, exitDate, resolution, futuresOptions);
    }

    return {
      type: resolution === 'D' ? 'daily' : 'intraday',
      interval: RESOLUTIONS[resolution].interval,
      candles,
      source: 'yahoo',
      symbol: trade.symbol,
      chart_symbol: yahooSymbol,
      futures_continuous: true,
      tick_size: asNumber(trade.tick_size) ?? getFuturesTickSize(root),
      point_value: asNumber(trade.point_value) ?? getFuturesPointValue(root),
      available_resolutions: this.availableResolutions(entryDate),
      fallback: resolution !== requestedResolution,
      fallback_reason: fallbackReason
    };
  }

  // Resolution that suits both the age of the trade (Yahoo's retention) and
  // how long it was held.
  // Which resolutions an equity trade can ACTUALLY be served at. Age alone is
  // not enough: a ten-day hold resolves a 1m request to 5m, so advertising 1m
  // would leave a control enabled that can never be honoured. Every resolution
  // is filtered through the same age and span rules the request path applies.
  availableStockResolutions(entryDate, exitDate) {
    const byAge = this.availableResolutions(entryDate);
    const serveable = byAge.filter(
      (resolution) => this.effectiveStockResolution(resolution, entryDate, exitDate) === resolution
    );

    // 'D' is always serveable and must never be filtered out of the list.
    return serveable.includes('D') ? serveable : [...serveable, 'D'];
  }

  effectiveStockResolution(requestedResolution, entryDate, exitDate) {
    let resolution = this.effectiveResolution(requestedResolution, entryDate);
    if (resolution === 'D') return resolution;

    const entryTime = toDate(entryDate);
    const exitTime = toDate(exitDate) || new Date();
    const span = Math.max(0, exitTime.getTime() - entryTime.getTime());

    const order = ['1', '5', '15', '60'];
    let index = order.indexOf(resolution);
    while (index !== -1 && index < order.length && span > (MAX_SPAN_MS[order[index]] ?? Infinity)) {
      index += 1;
      resolution = order[index] || 'D';
    }

    return resolution;
  }

  // Bars for an explicit window, for callers that know the span they need
  // rather than deriving it from a trade. Yahoo retains 1-minute data for
  // roughly 30 days.
  async getCandlesInWindow(symbol, fromSeconds, toSeconds, resolution = '1') {
    if (!this.isEnabled()) {
      throw new Error('Yahoo Finance fallback is disabled');
    }

    const yahooSymbol = this.getYahooSymbol(symbol);
    if (!yahooSymbol) {
      throw new Error(`No Yahoo Finance symbol for ${symbol}`);
    }

    return this.fetchCandles(yahooSymbol, null, null, resolution, {
      window: { period1: Math.floor(fromSeconds), period2: Math.floor(toSeconds) }
    });
  }

  // Latest price for a listing the configured provider cannot quote. Finnhub's
  // free tier is US-only, so European holdings otherwise show no current price
  // and no unrealized P&L at all. Shaped like the Finnhub quote the callers
  // already consume: c = current, pc = previous close, d/dp = change.
  async getQuote(symbol) {
    if (!this.isEnabled()) return null;

    const yahooSymbol = this.getYahooSymbol(symbol);
    if (!yahooSymbol) return null;

    const cached = await cache.get('yahoo_quote', yahooSymbol);
    if (cached) return cached;

    try {
      const response = await axios.get(
        `https://${YAHOO_CHART_HOSTS[0]}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`,
        {
          timeout: 8000,
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          params: { interval: '1d', range: '5d' }
        }
      );

      const meta = response.data?.chart?.result?.[0]?.meta;
      const current = asNumber(meta?.regularMarketPrice);
      if (current === null) return null;

      const previousClose = asNumber(meta?.chartPreviousClose) ?? asNumber(meta?.previousClose) ?? 0;
      const change = previousClose ? current - previousClose : 0;

      const quote = {
        c: current,
        pc: previousClose,
        d: change,
        dp: previousClose ? (change / previousClose) * 100 : 0,
        h: asNumber(meta?.regularMarketDayHigh),
        l: asNumber(meta?.regularMarketDayLow),
        o: null,
        currency: meta?.currency || null,
        source: 'yahoo'
      };

      await cache.set('yahoo_quote', yahooSymbol, quote);
      return quote;
    } catch (error) {
      console.warn(`[QUOTES] Yahoo Finance quote failed for ${yahooSymbol}: ${error.message}`);
      return null;
    }
  }

  // Search needs no crumb, unlike quoteSummary, but is fuzzy.
  async getSymbolProfile(symbol) {
    if (!this.isEnabled()) return null;

    const yahooSymbol = this.getYahooSymbol(symbol);
    if (!yahooSymbol) return null;

    const cached = await cache.get('yahoo_symbol_profile', yahooSymbol);
    if (cached) return cached.miss ? null : cached;

    try {
      const response = await axios.get(
        `https://${YAHOO_CHART_HOSTS[1]}/v1/finance/search`,
        {
          timeout: 8000,
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          params: { q: yahooSymbol, quotesCount: 5, newsCount: 0, enableFuzzyQuery: false }
        }
      );

      // Exact match only, or a symbol adopts a neighbour's industry.
      const match = (response.data?.quotes || []).find(
        (candidate) => String(candidate?.symbol || '').toUpperCase() === yahooSymbol
      );
      if (!match) {
        await cache.set('yahoo_symbol_profile', yahooSymbol, { miss: true });
        return null;
      }

      const profile = {
        symbol: yahooSymbol,
        name: match.longname || match.shortname || null,
        // An ETF legitimately has none.
        industry: match.industry || null,
        exchange: match.exchDisp || match.exchange || null,
        quoteType: match.quoteType || null
      };

      if (profile.name || profile.industry) {
        await cache.set('yahoo_symbol_profile', yahooSymbol, profile);
      } else {
        await cache.set('yahoo_symbol_profile', yahooSymbol, { miss: true });
      }

      return profile;
    } catch (error) {
      console.warn(`[SYMBOLS] Yahoo Finance profile lookup failed for ${yahooSymbol}: ${error.message}`);
      return null;
    }
  }

  // The chart endpoint already carries the name, so this is one cached request.
  async getSymbolName(symbol) {
    if (!this.isEnabled()) return null;

    const yahooSymbol = this.getYahooSymbol(symbol);
    if (!yahooSymbol) return null;

    const cached = await cache.get('yahoo_symbol_name', yahooSymbol);
    if (cached) return cached.miss ? null : cached;

    try {
      const response = await axios.get(
        `https://${YAHOO_CHART_HOSTS[0]}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`,
        {
          timeout: 8000,
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          params: { interval: '1d', range: '1d' }
        }
      );

      const meta = response.data?.chart?.result?.[0]?.meta;
      const name = meta?.longName || meta?.shortName || null;
      await cache.set('yahoo_symbol_name', yahooSymbol, name || { miss: true });
      return name;
    } catch (error) {
      console.warn(`[SYMBOLS] Yahoo Finance name lookup failed for ${yahooSymbol}: ${error.message}`);
      return null;
    }
  }

  async getStockTradeChartData(symbol, entryDate, exitDate = null, requestedResolution = 'D') {
    if (!this.isEnabled()) {
      throw new Error('Yahoo Finance fallback is disabled');
    }

    const yahooSymbol = this.getYahooSymbol(symbol);
    let resolution = this.effectiveStockResolution(requestedResolution, entryDate, exitDate);
    let downgradeReason = resolution !== requestedResolution
      ? `Yahoo Finance does not retain ${RESOLUTIONS[requestedResolution]?.interval || requestedResolution} data for a trade this old or this long.`
      : null;
    let candles;

    const options = { spanHoldingPeriod: true };

    try {
      candles = await this.fetchCandles(yahooSymbol, entryDate, exitDate, resolution, options);
    } catch (error) {
      if (resolution === 'D') throw error;
      downgradeReason = error.message;
      resolution = 'D';
      candles = await this.fetchCandles(yahooSymbol, entryDate, exitDate, resolution, options);
    }

    return {
      type: resolution === 'D' ? 'daily' : 'intraday',
      interval: RESOLUTIONS[resolution].interval,
      candles,
      source: 'yahoo',
      symbol: yahooSymbol,
      available_resolutions: this.availableStockResolutions(entryDate, exitDate),
      intraday_unavailable_reason: resolution === 'D' ? downgradeReason : null
    };
  }
}

module.exports = new YahooFinanceClient();
module.exports.isRetryableNetworkError = isRetryableNetworkError;
