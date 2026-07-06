const axios = require('axios');
const cache = require('./cache');
const historicalPriceCache = require('./historicalPriceCache');
const ApiUsageService = require('../services/apiUsageService');
const TierService = require('../services/tierService');
const { FinnhubPriority, FinnhubRequestScheduler } = require('./finnhubScheduler');

class UnsupportedMarketDataError extends Error {
  constructor(feature) {
    super(`FMP does not support ${feature}`);
    this.name = 'UnsupportedMarketDataError';
    this.code = 'MARKET_DATA_UNSUPPORTED';
    this.feature = feature;
    this.provider = 'fmp';
  }
}

function asNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compactObject(values) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== null && value !== undefined)
  );
}

function rawSharesToFinnhubProfileShares(value) {
  const shares = asNumber(value);
  if (!shares) return null;
  return shares > 1_000_000 ? shares / 1_000_000 : shares;
}

function toDateString(timestamp) {
  if (!timestamp) return new Date().toISOString().split('T')[0];
  if (typeof timestamp === 'number') {
    return new Date(timestamp * 1000).toISOString().split('T')[0];
  }
  return new Date(timestamp).toISOString().split('T')[0];
}

function unixSeconds(dateLike) {
  if (!dateLike) return null;
  return Math.floor(new Date(dateLike).getTime() / 1000);
}

function normalizePeriod(frequency) {
  return frequency === 'quarterly' ? 'quarter' : 'annual';
}

class FmpClient {
  constructor() {
    this.providerName = 'fmp';
    this.displayName = 'Financial Modeling Prep';
    this.apiKey = process.env.FMP_API_KEY;
    this.baseURL = process.env.FMP_BASE_URL || 'https://financialmodelingprep.com/stable';
    this.maxCallsPerMinute = parseInt(process.env.FMP_RATE_LIMIT_PER_MINUTE, 10) || 60;
    this.maxCallsPerSecond = parseInt(process.env.FMP_RATE_LIMIT_PER_SECOND, 10) || 5;
    this.scheduler = new FinnhubRequestScheduler({
      label: 'FMP',
      maxCallsPerMinute: this.maxCallsPerMinute,
      maxCallsPerSecond: this.maxCallsPerSecond,
      activeReservePerMinute: parseInt(process.env.FMP_ACTIVE_RESERVE_PER_MINUTE, 10) || undefined
    });
    this.callTimestamps = this.scheduler.callTimestamps;
    this.secondTimestamps = this.scheduler.secondTimestamps;
  }

  isConfigured() {
    return !!this.apiKey;
  }

  normalizeUserContext(userIdOrOptions = null, options = {}) {
    if (userIdOrOptions && typeof userIdOrOptions === 'object') {
      return {
        userId: userIdOrOptions.userId || null,
        options: userIdOrOptions
      };
    }

    return {
      userId: userIdOrOptions,
      options
    };
  }

  unsupported(feature) {
    throw new UnsupportedMarketDataError(feature);
  }

  async makeRequest(endpoint, params = {}, context = {}) {
    if (!this.apiKey) {
      throw new Error('FMP API key not configured');
    }

    const requestContext = {
      endpoint,
      source: context.source || 'fmp',
      priority: context.priority ?? FinnhubPriority.ACTIVE_OTHER,
      userId: context.userId,
      background: context.background,
      maxQueueWaitMs: context.maxQueueWaitMs
    };

    const executeRequest = async () => {
      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        params: {
          ...params,
          apikey: this.apiKey
        },
        timeout: 10000
      });

      if (response.data?.['Error Message'] || response.data?.error) {
        throw new Error(`FMP API error: ${response.data['Error Message'] || response.data.error}`);
      }

      return response.data;
    };

    const MAX_RATE_LIMIT_RETRIES = 2;
    let rateLimitRetries = 0;

    while (true) {
      try {
        return await this.scheduler.schedule(executeRequest, requestContext);
      } catch (error) {
        if (error.code && String(error.code).startsWith('FINNHUB_SCHEDULER_')) {
          throw error;
        }
        if (error.response) {
          // A 429 puts the scheduler into cooldown; re-queue the request and
          // let the scheduler pace the retry once the provider window clears.
          if (error.response.status === 429 && rateLimitRetries < MAX_RATE_LIMIT_RETRIES) {
            rateLimitRetries++;
            console.warn(`[FMP] 429 on ${endpoint}, re-queueing (retry ${rateLimitRetries}/${MAX_RATE_LIMIT_RETRIES})`);
            continue;
          }
          if (error.response.status === 429) {
            throw new Error(`FMP API rate limit exceeded: ${error.response.status}`);
          }
          throw new Error(`FMP API error: ${error.response.status} - ${error.response.data?.error || error.response.statusText || 'Unknown error'}`);
        }
        throw error;
      }
    }
  }

  normalizeQuote(row) {
    if (!row) return null;
    const current = asNumber(row.price ?? row.c);
    const previousClose = asNumber(row.previousClose ?? row.previous_close ?? row.pc);
    const change = asNumber(row.change ?? row.d ?? (current !== null && previousClose !== null ? current - previousClose : null));
    const changePercent = asNumber(row.changesPercentage ?? row.changePercentage ?? row.dp);
    const timestamp = asNumber(row.timestamp ?? row.t) || Math.floor(Date.now() / 1000);

    return {
      c: current,
      d: change,
      dp: changePercent,
      h: asNumber(row.dayHigh ?? row.high ?? row.h),
      l: asNumber(row.dayLow ?? row.low ?? row.l),
      o: asNumber(row.open ?? row.o),
      pc: previousClose,
      t: timestamp
    };
  }

  async getQuote(symbol, userIdOrOptions = null, options = {}) {
    const normalizedContext = this.normalizeUserContext(userIdOrOptions, options);
    const userId = normalizedContext.userId;
    const requestOptions = normalizedContext.options;
    const symbolUpper = symbol.toUpperCase();

    if (userId) {
      const userTier = await TierService.getUserTier(userId);
      const limitCheck = await ApiUsageService.checkLimit(userId, 'quote', userTier);
      if (!limitCheck.allowed) {
        const error = new Error(limitCheck.message || 'API limit exceeded');
        error.code = limitCheck.upgradeRequired ? 'PRO_REQUIRED' : 'RATE_LIMIT_EXCEEDED';
        error.resetAt = limitCheck.resetAt;
        error.remaining = limitCheck.remaining;
        throw error;
      }
    }

    const cached = await cache.get('quote', `fmp_${symbolUpper}`);
    if (cached) return cached;

    const data = await this.makeRequest('/quote', { symbol: symbolUpper }, {
      source: requestOptions.source || 'quote',
      priority: requestOptions.priority ?? FinnhubPriority.ACTIVE_QUOTE,
      userId,
      background: requestOptions.background,
      maxQueueWaitMs: requestOptions.maxQueueWaitMs
    });
    const quote = this.normalizeQuote(Array.isArray(data) ? data[0] : data);
    if (!quote || quote.c === null || quote.c === 0) {
      throw new Error(`No quote data available for ${symbol}`);
    }

    await cache.set('quote', `fmp_${symbolUpper}`, quote);
    try {
      await historicalPriceCache.upsertToday(symbolUpper, quote, 'fmp');
    } catch (dbErr) {
      console.warn(`[PRICE-CACHE] Failed to persist FMP quote for ${symbolUpper}: ${dbErr.message}`);
    }
    if (userId) {
      await ApiUsageService.trackApiCall(userId, 'quote');
    }
    return quote;
  }

  async getBatchQuotes(symbols, options = {}) {
    const results = {};
    const failures = {};
    const validSymbols = [...new Set(symbols.map(s => s.toUpperCase()))]
      .filter(symbol => !/^[0-9A-Z]{8}[0-9]$/.test(symbol) && symbol.length <= 8);

    if (validSymbols.length === 0) return results;

    const chunkSize = Math.max(this.maxCallsPerSecond, 1);
    for (let i = 0; i < validSymbols.length; i += chunkSize) {
      const chunk = validSymbols.slice(i, i + chunkSize);
      const settled = await Promise.allSettled(chunk.map(async (symbol) => {
        try {
          const quote = this.isCryptoSymbol(symbol)
            ? await this.getCryptoQuote(symbol)
            : await this.getQuote(symbol, options);
          return { symbol, quote };
        } catch (error) {
          error.symbol = symbol;
          throw error;
        }
      }));

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          results[result.value.symbol] = result.value.quote;
        } else if (result.reason?.symbol) {
          failures[result.reason.symbol] = result.reason;
        }
      }
    }

    Object.defineProperty(results, '_failures', {
      value: failures,
      enumerable: false
    });
    return results;
  }

  async symbolSearch(query) {
    const data = await this.makeRequest('/search-symbol', { query });
    const rows = Array.isArray(data) ? data : [];
    return {
      count: rows.length,
      result: rows.map(row => ({
        symbol: row.symbol,
        description: row.name || row.companyName || row.symbol,
        type: row.exchangeShortName || row.exchange || row.type,
        displaySymbol: row.symbol
      }))
    };
  }

  async searchSymbol(query) {
    const results = await this.symbolSearch(query);
    const match = results.result?.[0];
    return match || null;
  }

  async lookupCusip(cusip) {
    if (!cusip || cusip.length !== 9) {
      throw new Error('Invalid CUSIP format');
    }
    const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();
    const cached = await cache.get('cusip_resolution', cleanCusip);
    if (cached) return cached;

    const data = await this.makeRequest('/search-cusip', { cusip: cleanCusip });
    const rows = Array.isArray(data) ? data : [];
    const match = rows.find(row =>
      String(row.cusip || '').toUpperCase() === cleanCusip ||
      String(row.symbol || '').toUpperCase() === cleanCusip
    ) || rows[0];

    const ticker = match?.symbol ? String(match.symbol).toUpperCase() : null;
    await cache.set('cusip_resolution', cleanCusip, ticker);
    return ticker;
  }

  async mapCusipToSymbol(cusip) {
    try {
      return await this.lookupCusip(cusip);
    } catch (error) {
      console.warn(`FMP CUSIP lookup failed for ${cusip}: ${error.message}`);
      return null;
    }
  }

  async batchLookupCusips(cusips, userId = null, onResolveCallback = null) {
    const results = {};
    const uniqueCusips = [...new Set(cusips.map(c => c.replace(/\s/g, '').toUpperCase()))];
    for (const cusip of uniqueCusips) {
      try {
        const ticker = await this.lookupCusip(cusip, userId);
        if (ticker) {
          results[cusip] = ticker;
          if (onResolveCallback) await onResolveCallback(cusip, ticker, userId);
        }
      } catch (error) {
        console.warn(`Failed to resolve CUSIP ${cusip} with FMP: ${error.message}`);
      }
    }
    return results;
  }

  async getCompanyProfile(symbol) {
    const symbolUpper = symbol.toUpperCase();
    const cached = await cache.get('company_profile', `fmp_${symbolUpper}`);
    if (cached) return cached;

    const [data, metricsRows] = await Promise.all([
      this.makeRequest('/profile', { symbol: symbolUpper }),
      this.makeRequest('/key-metrics', { symbol: symbolUpper, period: 'annual', limit: 1 }).catch(() => [])
    ]);
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const metrics = Array.isArray(metricsRows) ? metricsRows[0] || {} : {};
    const rawSharesOutstanding = row.sharesOutstanding
      ?? row.shareOutstanding
      ?? row.commonStockSharesOutstanding
      ?? metrics.sharesOutstanding
      ?? metrics.weightedAverageShsOut;
    const profile = {
      ...row,
      ticker: row.symbol || symbolUpper,
      name: row.companyName || row.name,
      logo: row.image || row.logo,
      finnhubIndustry: row.industry || row.sector || null,
      marketCapitalization: asNumber(row.mktCap ?? row.marketCap),
      shareOutstanding: rawSharesToFinnhubProfileShares(rawSharesOutstanding),
      exchange: row.exchangeShortName || row.exchange,
      currency: row.currency || row.currencySymbol || 'USD',
      country: row.country || null
    };
    await cache.set('company_profile', `fmp_${symbolUpper}`, profile);
    return profile;
  }

  async getCompanyNews(symbol, fromDate = null, toDate = null) {
    const symbolUpper = symbol.toUpperCase();
    const to = toDate || new Date().toISOString().split('T')[0];
    const from = fromDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const cacheKey = `fmp_${symbolUpper}_${from}_${to}`;
    const cached = await cache.get('company_news', cacheKey);
    if (cached) return cached;

    const data = await this.makeRequest('/news/stock', {
      symbols: symbolUpper,
      from,
      to
    });
    const news = (Array.isArray(data) ? data : []).map((item, index) => ({
      id: item.id || `${symbolUpper}-${item.publishedDate || item.date || index}`,
      datetime: unixSeconds(item.publishedDate || item.date),
      headline: item.title || item.headline,
      summary: item.text || item.summary || '',
      source: item.publisher || item.site || item.source || 'FMP',
      url: item.url,
      image: item.image,
      related: item.symbol || symbolUpper
    }));
    await cache.set('company_news', cacheKey, news);
    return news;
  }

  resolutionToEndpoint(resolution) {
    if (resolution === '1') return '/historical-chart/1min';
    if (resolution === '5') return '/historical-chart/5min';
    if (resolution === '15') return '/historical-chart/15min';
    if (resolution === '30') return '/historical-chart/30min';
    if (resolution === '60') return '/historical-chart/1hour';
    if (resolution === '4H') return '/historical-chart/4hour';
    return '/historical-price-eod/full';
  }

  async getStockCandles(symbol, resolution = '1', from, to, userIdOrOptions = null, options = {}) {
    const normalizedContext = this.normalizeUserContext(userIdOrOptions, options);
    const userId = normalizedContext.userId;
    const requestOptions = normalizedContext.options;
    const symbolUpper = symbol.toUpperCase();

    if (userId) {
      const userTier = await TierService.getUserTier(userId);
      const limitCheck = await ApiUsageService.checkLimit(userId, 'candle', userTier);
      if (!limitCheck.allowed) {
        const error = new Error(limitCheck.message || 'API limit exceeded');
        error.code = limitCheck.upgradeRequired ? 'PRO_REQUIRED' : 'RATE_LIMIT_EXCEEDED';
        error.resetAt = limitCheck.resetAt;
        error.remaining = limitCheck.remaining;
        throw error;
      }
    }

    const cacheKey = `fmp_${symbolUpper}_${resolution}_${from}_${to}`;
    const cached = await cache.get('stock_candles', cacheKey);
    if (cached) return cached;

    const endpoint = this.resolutionToEndpoint(resolution);
    const params = {
      symbol: symbolUpper,
      from: toDateString(from),
      to: toDateString(to)
    };
    const data = await this.makeRequest(endpoint, params, {
      source: requestOptions.source || 'stock_candles',
      priority: requestOptions.priority ?? (userId ? FinnhubPriority.ACTIVE_CANDLE : FinnhubPriority.ACTIVE_OTHER),
      userId,
      background: requestOptions.background,
      maxQueueWaitMs: requestOptions.maxQueueWaitMs
    });

    const rows = Array.isArray(data) ? data : (data?.historical || []);
    const candles = rows.map(row => ({
      time: unixSeconds(row.date || row.label),
      open: asNumber(row.open),
      high: asNumber(row.high),
      low: asNumber(row.low),
      close: asNumber(row.close ?? row.adjClose),
      volume: asNumber(row.volume)
    })).filter(candle => candle.time && candle.close !== null)
      .sort((a, b) => a.time - b.time);

    if (candles.length === 0) {
      throw new Error(`No candle data available for ${symbol}`);
    }

    await cache.set('stock_candles', cacheKey, candles);
    try {
      await historicalPriceCache.insertCandles(symbolUpper, candles, 'fmp');
    } catch (dbErr) {
      console.warn(`[PRICE-CACHE] Failed to persist FMP candles for ${symbolUpper}: ${dbErr.message}`);
    }
    if (userId) {
      await ApiUsageService.trackApiCall(userId, 'candle');
    }
    return candles;
  }

  async getCandles(symbol, resolution, from, to, userIdOrOptions = null, options = {}) {
    return this.getStockCandles(symbol, resolution, from, to, userIdOrOptions, options);
  }

  async getTradeChartData(symbol, entryDate, exitDate = null, userId = null) {
    const entryTime = new Date(entryDate);
    const entryDateUTC = new Date(entryTime.toISOString().split('T')[0] + 'T00:00:00.000Z');
    const chartFromTime = new Date(entryDateUTC.getTime() + 9 * 60 * 60 * 1000);
    const chartToTime = new Date(entryDateUTC.getTime() + 25 * 60 * 60 * 1000);
    const fromTimestamp = Math.floor(chartFromTime.getTime() / 1000);
    const toTimestamp = Math.floor(chartToTime.getTime() / 1000);
    const candles = await this.getStockCandles(symbol, '1', fromTimestamp, toTimestamp, userId);
    return {
      type: 'intraday',
      interval: '1min',
      candles,
      source: 'fmp'
    };
  }

  async getEarningsCalendar(fromDate = null, toDate = null, symbol = null) {
    const from = fromDate || new Date().toISOString().split('T')[0];
    const to = toDate || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const cacheKey = symbol ? `fmp_${symbol.toUpperCase()}_${from}_${to}` : `fmp_all_${from}_${to}`;
    const cached = await cache.get('earnings', cacheKey);
    if (cached) return cached;

    const params = { from, to };
    if (symbol) params.symbol = symbol.toUpperCase();
    const data = await this.makeRequest('/earnings-calendar', params);
    const rows = Array.isArray(data) ? data : [];
    const earnings = rows.map(row => ({
      symbol: row.symbol,
      date: row.date,
      hour: row.time,
      epsActual: asNumber(row.epsActual ?? row.eps),
      epsEstimate: asNumber(row.epsEstimated ?? row.epsEstimate),
      revenueActual: asNumber(row.revenueActual),
      revenueEstimate: asNumber(row.revenueEstimated ?? row.revenueEstimate)
    }));
    await cache.set('earnings', cacheKey, earnings);
    return earnings;
  }

  /**
   * Get analyst consensus estimates (revenue/EPS) per fiscal period.
   * Used to derive forward P/E from the next fiscal year's consensus EPS.
   * Rows are returned most-recent-first, each tagged with its fiscal-period
   * end date so callers can pick the appropriate forward year.
   */
  async getAnalystEstimates(symbol, period = 'annual') {
    if (!this.apiKey) return null;
    const symbolUpper = symbol.toUpperCase();
    const cacheKey = `fmp_estimates_${symbolUpper}_${period}`;
    const cached = await cache.get('analyst_estimates', cacheKey);
    if (cached) return cached;

    // FMP caps `limit` at 10 on lower subscription tiers — a higher value
    // returns HTTP 402 and fails the whole request. 10 annual rows still
    // covers several forward years, which is all we need for forward P/E.
    const data = await this.makeRequest('/analyst-estimates', {
      symbol: symbolUpper,
      period,
      limit: 10
    });
    const rows = (Array.isArray(data) ? data : []).map(row => ({
      date: row.date,
      epsAvg: asNumber(row.epsAvg),
      epsHigh: asNumber(row.epsHigh),
      epsLow: asNumber(row.epsLow),
      revenueAvg: asNumber(row.revenueAvg),
      numAnalystsEps: asNumber(row.numAnalystsEps)
    }));
    // Estimates change slowly; cache for 24 hours (4-arg form sets a real TTL).
    await cache.set('analyst_estimates', cacheKey, rows, 24 * 60 * 60 * 1000);
    return rows;
  }

  async getStockSplits(symbol, from, to, options = {}) {
    if (!this.apiKey) return [];
    const symbolUpper = symbol.toUpperCase();
    const cacheKey = `fmp_${symbolUpper}_${from}_${to}`;
    const cached = await cache.get('stock_splits', cacheKey);
    if (cached) return cached;

    const data = await this.makeRequest('/splits', { symbol: symbolUpper, from, to }, {
      source: options.source || 'stock_split_service',
      priority: options.priority ?? FinnhubPriority.BACKGROUND_MAINTENANCE,
      background: options.background ?? true,
      maxQueueWaitMs: options.maxQueueWaitMs ?? 0
    });
    const splits = (Array.isArray(data) ? data : []).map(row => ({
      symbol: row.symbol || symbolUpper,
      date: row.date,
      fromFactor: asNumber(row.numerator ?? row.fromFactor),
      toFactor: asNumber(row.denominator ?? row.toFactor),
      ratio: row.ratio || null
    }));
    await cache.set('stock_splits', cacheKey, splits, 24 * 60 * 60 * 1000);
    return splits;
  }

  async getIndexConstituents(symbol) {
    const endpointMap = {
      '^GSPC': '/sp500-constituent',
      '^SPX': '/sp500-constituent',
      '^SP400': '/sp400-constituent',
      '^SP600': '/sp600-constituent',
      '^DJI': '/dowjones-constituent',
      '^IXIC': '/nasdaq-constituent'
    };
    const endpoint = endpointMap[String(symbol || '').toUpperCase()];
    if (!endpoint) {
      return this.unsupported(`index constituents for ${symbol}`);
    }
    const data = await this.makeRequest(endpoint);
    return (Array.isArray(data) ? data : [])
      .map(row => row.symbol)
      .filter(Boolean);
  }

  async getForexRate(base, target = 'USD', date = null) {
    const baseUpper = base.toUpperCase();
    const targetUpper = target.toUpperCase();
    if (baseUpper === targetUpper) return 1.0;
    const formattedDate = date || new Date().toISOString().split('T')[0];
    const cacheKey = `fmp_forex_${baseUpper}_${targetUpper}_${formattedDate}`;
    const cached = await cache.get('forex_rates', cacheKey);
    if (cached) return cached;

    const pair = `${baseUpper}${targetUpper}`;
    const data = await this.makeRequest('/historical-price-eod/full', {
      symbol: pair,
      from: formattedDate,
      to: formattedDate
    });
    const row = (data?.historical || data || [])[0];
    const rate = asNumber(row?.close ?? row?.price);
    if (!rate) throw new Error(`No forex rate available for ${baseUpper}/${targetUpper} on ${formattedDate}`);
    // Explicit TTL: the value is numeric, so the 3-arg form would be misread
    // as a direct-key set with a TTL
    await cache.set('forex_rates', cacheKey, rate, 24 * 60 * 60 * 1000);
    return rate;
  }

  async getFinancialStatements(symbol, frequency = 'annual') {
    const symbolUpper = symbol.toUpperCase();
    const cacheKey = `fmp_financials_${symbolUpper}_${frequency}`;
    const cached = await cache.get('financial_statements', cacheKey);
    if (cached) return cached;

    const period = normalizePeriod(frequency);
    const [income, balance, cash] = await Promise.all([
      this.makeRequest('/income-statement', { symbol: symbolUpper, period, limit: 120 }),
      this.makeRequest('/balance-sheet-statement', { symbol: symbolUpper, period, limit: 120 }),
      this.makeRequest('/cash-flow-statement', { symbol: symbolUpper, period, limit: 120 })
    ]);

    const byDate = new Map();
    const mergeRows = (rows, mapper) => {
      for (const row of Array.isArray(rows) ? rows : []) {
        const key = row.date || row.calendarYear || row.fiscalYear;
        byDate.set(key, { ...(byDate.get(key) || {}), ...compactObject(mapper(row)) });
      }
    };

    mergeRows(income, row => ({
      year: Number(row.calendarYear || new Date(row.date).getUTCFullYear()),
      fiscalYear: Number(row.calendarYear || new Date(row.date).getUTCFullYear()),
      quarter: period === 'quarter' ? row.period : null,
      fiscalQuarter: period === 'quarter' ? row.period : null,
      period: frequency,
      filingDate: row.fillingDate || row.acceptedDate || row.date,
      revenue: asNumber(row.revenue),
      netIncome: asNumber(row.netIncome),
      operatingIncome: asNumber(row.operatingIncome),
      incomeBeforeTax: asNumber(row.incomeBeforeTax),
      incomeTaxExpense: asNumber(row.incomeTaxExpense),
      grossProfit: asNumber(row.grossProfit),
      ebit: asNumber(row.ebit),
      ebitda: asNumber(row.ebitda),
      eps: asNumber(row.eps),
      sharesOutstanding: asNumber(row.weightedAverageShsOut ?? row.weightedAverageSharesOutstanding),
      sharesBasic: asNumber(row.weightedAverageShsOut),
      sharesDiluted: asNumber(row.weightedAverageShsOutDil)
    }));
    mergeRows(balance, row => ({
      totalAssets: asNumber(row.totalAssets),
      totalLiabilities: asNumber(row.totalLiabilities),
      totalEquity: asNumber(row.totalStockholdersEquity ?? row.totalEquity),
      longTermDebt: asNumber(row.longTermDebt),
      shortTermDebt: asNumber(row.shortTermDebt),
      totalDebt: asNumber(row.totalDebt),
      cashAndEquivalents: asNumber(row.cashAndCashEquivalents),
      accountsPayable: asNumber(row.accountPayables),
      sharesOutstanding: asNumber(row.commonStockSharesOutstanding)
    }));
    mergeRows(cash, row => ({
      operatingCashFlow: asNumber(row.operatingCashFlow ?? row.netCashProvidedByOperatingActivities),
      capitalExpenditures: Math.abs(asNumber(row.capitalExpenditure ?? row.capitalExpenditures) || 0) || null,
      freeCashFlow: asNumber(row.freeCashFlow),
      dividendsPaid: asNumber(row.dividendsPaid ?? row.netDividendsPaid ?? row.commonDividendsPaid)
    }));

    const financials = [...byDate.values()]
      .filter(row => row.year)
      .sort((a, b) => b.year - a.year);
    const result = { symbol: symbolUpper, financials };
    await cache.set('financial_statements', cacheKey, result);
    return result;
  }

  async getBasicFinancials(symbol) {
    const symbolUpper = symbol.toUpperCase();
    const cacheKey = `fmp_metrics_${symbolUpper}`;
    const cached = await cache.get('basic_financials', cacheKey);
    if (cached) return cached;

    // FMP spreads these metrics across several endpoints: valuation ratios on
    // /ratios(-ttm), beta + indicated dividend on /profile, and the 52-week
    // range on /quote. Pull them all so the Finnhub-shaped `metric` object the
    // DCF service consumes is fully populated.
    const [metricsRows, ratiosRows, ratiosTtmRows, quoteRows, profileRows] = await Promise.all([
      this.makeRequest('/key-metrics', { symbol: symbolUpper, period: 'annual', limit: 5 }).catch(() => []),
      this.makeRequest('/ratios', { symbol: symbolUpper, period: 'annual', limit: 5 }).catch(() => []),
      this.makeRequest('/ratios-ttm', { symbol: symbolUpper }).catch(() => []),
      this.makeRequest('/quote', { symbol: symbolUpper }).catch(() => []),
      this.makeRequest('/profile', { symbol: symbolUpper }).catch(() => [])
    ]);
    const first = (rows) => (Array.isArray(rows) ? rows[0] || {} : rows || {});
    const metrics = first(metricsRows);
    const ratios = first(ratiosRows);
    const ratiosTtm = first(ratiosTtmRows);
    const quote = first(quoteRows);
    const profile = first(profileRows);

    const price = asNumber(quote.price ?? profile.price);

    // FMP reports dividend yield as a fraction (0.0035); the DCF service
    // divides Finnhub-style yields by 100, so hand it a percentage (0.35).
    const dividendYieldTtmFraction = asNumber(ratiosTtm.dividendYieldTTM);
    const dividendYieldTtmPct = dividendYieldTtmFraction !== null ? dividendYieldTtmFraction * 100 : null;

    // Indicated forward yield from the latest annualized dividend per share.
    const indicatedAnnualDividend = asNumber(profile.lastDividend ?? ratiosTtm.dividendPerShareTTM);
    const forwardDividendYieldPct = indicatedAnnualDividend !== null && price
      ? (indicatedAnnualDividend / price) * 100
      : dividendYieldTtmPct;

    const data = {
      symbol: symbolUpper,
      metric: {
        ...metrics,
        ...ratios,
        ...ratiosTtm,
        '10DayAverageTradingVolume': asNumber(metrics.averageVolume10Day ?? metrics['10DayAverageTradingVolume']),
        sharesOutstanding: asNumber(metrics.sharesOutstanding ?? metrics.weightedAverageShsOut),
        // 52-week range lives on the quote, not key-metrics.
        '52WeekHigh': asNumber(quote.yearHigh ?? metrics['52WeekHigh'] ?? metrics.yearHigh),
        '52WeekLow': asNumber(quote.yearLow ?? metrics['52WeekLow'] ?? metrics.yearLow),
        // Beta lives on the company profile.
        beta: asNumber(profile.beta),
        // Map FMP field names onto the Finnhub-style keys the DCF service reads.
        pegRatio: asNumber(ratiosTtm.priceToEarningsGrowthRatioTTM ?? ratios.priceToEarningsGrowthRatio ?? ratios.priceEarningsToGrowthRatio),
        psTTM: asNumber(ratiosTtm.priceToSalesRatioTTM ?? ratios.priceToSalesRatio),
        currentDividendYieldTTM: dividendYieldTtmPct,
        dividendYieldIndicatedAnnual: forwardDividendYieldPct
      }
    };
    // Metrics change slowly; cache 24h (4-arg form sets a real TTL).
    await cache.set('basic_financials', cacheKey, data, 24 * 60 * 60 * 1000);
    return data;
  }

  async getFinancialsReported(symbol, frequency = 'annual') {
    const symbolUpper = symbol.toUpperCase();
    const cacheKey = `fmp_reported_${symbolUpper}_${frequency}`;
    const cached = await cache.get('financials_reported', cacheKey);
    if (cached) return cached;

    const standardized = await this.getFinancialStatements(symbolUpper, frequency);
    const data = {
      symbol: symbolUpper,
      data: (standardized.financials || []).map(period => ({
        year: period.fiscalYear || period.year,
        form: frequency === 'quarterly' ? '10-Q' : '10-K',
        filedDate: period.filingDate,
        report: {
          bs: Object.entries({
            Assets: period.totalAssets,
            Liabilities: period.totalLiabilities,
            StockholdersEquity: period.totalEquity,
            LongTermDebt: period.longTermDebt,
            ShortTermDebt: period.shortTermDebt,
            CashAndCashEquivalents: period.cashAndEquivalents,
            AccountsPayable: period.accountsPayable,
            CommonStockSharesOutstanding: period.sharesOutstanding
          }).filter(([, value]) => value !== null && value !== undefined).map(([concept, value]) => ({ concept, value })),
          ic: Object.entries({
            Revenues: period.revenue,
            NetIncomeLoss: period.netIncome,
            OperatingIncomeLoss: period.operatingIncome,
            IncomeBeforeTax: period.incomeBeforeTax,
            IncomeTaxExpense: period.incomeTaxExpense,
            GrossProfit: period.grossProfit,
            EarningsPerShareBasic: period.eps
          }).filter(([, value]) => value !== null && value !== undefined).map(([concept, value]) => ({ concept, value })),
          cf: Object.entries({
            NetCashProvidedByUsedInOperatingActivities: period.operatingCashFlow,
            PaymentsToAcquirePropertyPlantAndEquipment: period.capitalExpenditures,
            PaymentsOfDividends: period.dividendsPaid
          }).filter(([, value]) => value !== null && value !== undefined).map(([concept, value]) => ({ concept, value }))
        }
      }))
    };
    await cache.set('financials_reported', cacheKey, data);
    return data;
  }

  async getDividends(symbol, from = null, to = null) {
    const symbolUpper = symbol.toUpperCase();
    if (!from) {
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      from = twoYearsAgo.toISOString().split('T')[0];
    }
    if (!to) to = new Date().toISOString().split('T')[0];

    const cacheKey = `fmp_dividends_${symbolUpper}_${from}_${to}`;
    const cached = await cache.get('dividends', cacheKey);
    if (cached) return cached;
    const data = await this.makeRequest('/dividends', { symbol: symbolUpper, from, to });
    const dividends = (Array.isArray(data) ? data : []).map(row => ({
      symbol: row.symbol || symbolUpper,
      date: row.date,
      amount: asNumber(row.dividend ?? row.amount),
      adjustedAmount: asNumber(row.adjDividend ?? row.adjustedAmount ?? row.dividend),
      payDate: row.paymentDate || row.payDate || null,
      recordDate: row.recordDate || null,
      declarationDate: row.declarationDate || null,
      currency: row.currency || 'USD'
    }));
    await cache.set('dividends', cacheKey, dividends);
    return dividends;
  }

  async getTechnicalIndicator(symbol, resolution, from, to, indicator, indicatorFields = {}) {
    const supported = new Set(['sma', 'ema', 'wma', 'dema', 'tema', 'rsi', 'adx', 'standardDeviation']);
    if (!supported.has(indicator)) {
      return this.unsupported(`technical indicator ${indicator}`);
    }
    const period = indicatorFields.timeperiod || indicatorFields.period || 14;
    const data = await this.makeRequest(`/technical-indicators/${indicator}`, {
      symbol: symbol.toUpperCase(),
      period,
      from: toDateString(from),
      to: toDateString(to)
    });
    return data;
  }

  async getTicks() {
    return this.unsupported('tick data');
  }

  async getTicksAroundTime() {
    return this.unsupported('tick data');
  }

  async getPatternRecognition() {
    return this.unsupported('pattern recognition');
  }

  async getSupportResistance() {
    return this.unsupported('support/resistance levels');
  }

  async getCacheStats() {
    const cacheStats = await cache.getStats();
    return {
      ...cacheStats,
      provider: 'fmp',
      rateLimitStats: this.scheduler.getStats()
    };
  }
}

FmpClient.CRYPTO_SYMBOLS = [
  'BTC', 'ETH', 'XRP', 'LTC', 'BCH', 'ADA', 'DOT', 'LINK', 'XLM', 'DOGE',
  'UNI', 'USDT', 'USDC', 'BNB', 'SOL', 'AVAX', 'MATIC', 'ATOM', 'FIL', 'TRX',
  'ETC', 'XMR', 'ALGO', 'VET', 'THETA', 'AAVE', 'EOS', 'MKR', 'COMP',
  'SHIB', 'CRO', 'DAI', 'WBTC', 'LDO', 'APT', 'ARB', 'OP', 'NEAR', 'ICP',
  'APE', 'GRT', 'FTM', 'SAND', 'MANA', 'AXS', 'EGLD', 'QNT', 'HBAR', 'CHZ',
  'FLOW', 'XTZ', 'NEO', 'PEPE', 'SUI'
];

FmpClient.CRYPTO_TO_COINGECKO = require('./finnhubClient').constructor.CRYPTO_TO_COINGECKO;
FmpClient.prototype.isCryptoSymbol = require('./finnhubClient').isCryptoSymbol.bind(require('./finnhubClient'));
FmpClient.prototype.getCryptoQuote = require('./finnhubClient').getCryptoQuote.bind(require('./finnhubClient'));
FmpClient.prototype.getCryptoProfile = require('./finnhubClient').getCryptoProfile.bind(require('./finnhubClient'));

module.exports = new FmpClient();
module.exports.UnsupportedMarketDataError = UnsupportedMarketDataError;
