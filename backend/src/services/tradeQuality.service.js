const db = require('../config/database');
const marketData = require('../utils/finnhub');

/**
 * Trade Quality Grading Service
 *
 * Grades trades based on stock metrics from Finnhub API (using historical data from trade entry date):
 * - News sentiment (default weight - 30%) - from /news-sentiment API with keyword analysis fallback
 * - Gap from previous close (default weight - 20%) - calculated from previous day close vs entry price
 * - Relative volume (default weight - 20%) - calculated from /stock/candle volume vs /stock/metric 10-day avg
 * - Float/Shares Outstanding (default weight - 15%) - from /stock/profile2
 * - Price range (default weight - 15%) - from trade entry price
 *
 * NOTE: Weights are user-customizable in user profile settings
 *
 * Metrics with no data are EXCLUDED from the weighted score (the remaining
 * weights are renormalized) rather than scored at a neutral default. A trade
 * is only graded when at least MIN_COVERAGE of the configured weight is
 * backed by real data.
 *
 * Grading uses a per-instrument profile (issue #352):
 * - stock:  news sentiment, gap, relative volume, float, price range
 * - option: news sentiment / gap / relative volume of the UNDERLYING (market
 *           data providers have no data for OCC contract symbols), plus time
 *           to expiration and strike distance from spot computed from the
 *           trade itself
 * - future: not gradeable - no futures market data is available from the
 *           configured providers
 *
 * Scoring: 5/5 = A, 4/5 = B, 3/5 = C, 2/5 = D, 0-1/5 = F
 */

// Minimum share of total weight that must be backed by real data to grade a trade
const MIN_COVERAGE = 0.4;

// Per-instrument grading profiles. Weights are decimals summing to 1.0.
const QUALITY_PROFILES = {
  stock: {
    metrics: ['newsSentiment', 'gap', 'relativeVolume', 'float', 'priceRange'],
    defaults: { newsSentiment: 0.30, gap: 0.20, relativeVolume: 0.20, float: 0.15, priceRange: 0.15 }
  },
  option: {
    metrics: ['newsSentiment', 'gap', 'relativeVolume', 'dte', 'moneyness'],
    defaults: { newsSentiment: 0.25, gap: 0.15, relativeVolume: 0.15, dte: 0.25, moneyness: 0.20 }
  }
};

// Internal metric key -> API/JSONB weight key
const METRIC_TO_WEIGHT_KEY = {
  newsSentiment: 'news',
  gap: 'gap',
  relativeVolume: 'relativeVolume',
  float: 'float',
  priceRange: 'priceRange',
  dte: 'dte',
  moneyness: 'moneyness'
};

// Human-readable metric names for failure messages
const METRIC_LABELS = {
  newsSentiment: 'news sentiment',
  gap: 'gap',
  relativeVolume: 'relative volume',
  float: 'float',
  priceRange: 'price range',
  dte: 'days to expiration',
  moneyness: 'strike distance'
};

// Where each metric's raw value and score live in the stored quality_metrics JSONB
const STORED_METRIC_FIELDS = {
  newsSentiment: ['newsSentiment', 'newsSentimentScore'],
  gap: ['gap', 'gapScore'],
  relativeVolume: ['relativeVolume', 'relativeVolumeScore'],
  float: ['float', 'floatScore'],
  priceRange: ['price', 'priceScore'],
  dte: ['dte', 'dteScore'],
  moneyness: ['moneyness', 'moneynessScore']
};

class TradeQualityService {
  constructor() {
    this.marketData = marketData;
  }

  /**
   * Resolve the grading profile for an instrument type
   * @param {string} instrumentType - Trade instrument_type
   * @returns {string|null} Profile key ('stock', 'option'), or null when the
   *                        instrument is not gradeable (futures)
   */
  getProfileType(instrumentType) {
    if (instrumentType === 'future') return null;
    return QUALITY_PROFILES[instrumentType] ? instrumentType : 'stock';
  }

  /**
   * Profile metadata for the API and frontend: the ordered list of API weight
   * keys per profile and their default percentages (integers summing to 100).
   * Single source of truth so controllers/UI never drift from the service.
   * @returns {Object} { [profileType]: { weightKeys: string[], defaults: Object } }
   */
  getQualityProfilesMeta() {
    const meta = {};
    for (const [profileType, profile] of Object.entries(QUALITY_PROFILES)) {
      const weightKeys = profile.metrics.map(metricKey => METRIC_TO_WEIGHT_KEY[metricKey]);
      const defaults = {};
      for (const metricKey of profile.metrics) {
        defaults[METRIC_TO_WEIGHT_KEY[metricKey]] = Math.round(profile.defaults[metricKey] * 100);
      }
      meta[profileType] = { weightKeys, defaults };
    }
    return meta;
  }

  /**
   * Get user's quality weight preferences for a grading profile
   * Falls back to the legacy flat columns (stock profile only), then defaults
   * @param {string} userId - User ID
   * @param {string} profileType - 'stock' or 'option'
   * @returns {Promise<Object>} Weights keyed by metric name (decimals summing to 1.0)
   */
  async getUserQualityWeights(userId, profileType = 'stock') {
    const profile = QUALITY_PROFILES[profileType] || QUALITY_PROFILES.stock;
    const defaultWeights = { ...profile.defaults };

    try {
      // If no userId provided, return defaults
      if (!userId) {
        console.log('[QUALITY] No userId provided, using default weights');
        return defaultWeights;
      }

      // Fetch user's custom weights from database
      const query = `
        SELECT
          quality_weight_profiles,
          quality_weight_news,
          quality_weight_gap,
          quality_weight_relative_volume,
          quality_weight_float,
          quality_weight_price_range
        FROM users
        WHERE id = $1
      `;

      const result = await db.query(query, [userId]);

      // If user not found or weights not set, return defaults
      if (!result.rows || result.rows.length === 0) {
        console.log(`[QUALITY] User ${userId} not found, using default ${profileType} weights`);
        return defaultWeights;
      }

      const row = result.rows[0];
      const storedProfile = row.quality_weight_profiles?.[profileType];

      if (storedProfile) {
        const weights = {};
        for (const metricKey of profile.metrics) {
          const value = Number(storedProfile[METRIC_TO_WEIGHT_KEY[metricKey]]);
          weights[metricKey] = Number.isFinite(value) ? value / 100 : profile.defaults[metricKey];
        }
        console.log(`[QUALITY] User ${userId} custom ${profileType} weights:`, weights);
        return weights;
      }

      // Legacy fallback: the original flat columns hold the stock profile
      if (profileType === 'stock') {
        return {
          newsSentiment: (row.quality_weight_news || 30) / 100,
          gap: (row.quality_weight_gap || 20) / 100,
          relativeVolume: (row.quality_weight_relative_volume || 20) / 100,
          float: (row.quality_weight_float || 15) / 100,
          priceRange: (row.quality_weight_price_range || 15) / 100
        };
      }

      return defaultWeights;
    } catch (error) {
      console.error('[QUALITY] Error fetching user quality weights:', error.message);
      // Return defaults on error
      return defaultWeights;
    }
  }

  /**
   * Retry API call with exponential backoff for 429 rate limit errors
   * @param {Function} apiCall - Function that returns a promise
   * @param {number} maxRetries - Maximum number of retries (default: 3)
   * @returns {Promise} Result of API call
   */
  async retryWithBackoff(apiCall, maxRetries = 3) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await apiCall();
      } catch (error) {
        // Check if it's a 429 rate limit error
        const is429 = error.response?.status === 429 ||
                      error.message?.includes('429') ||
                      error.message?.includes('rate limit');

        // If it's the last attempt or not a 429 error, throw
        if (attempt === maxRetries || !is429) {
          throw error;
        }

        // Calculate exponential backoff delay: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`[QUALITY] Rate limit hit (attempt ${attempt + 1}/${maxRetries + 1}), waiting ${delay}ms before retry...`);

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Convert categorical sentiment to numeric score
   * @param {string} sentiment - Categorical sentiment ('positive', 'negative', 'neutral', 'mixed')
   * @returns {number|null} Numeric sentiment score between -1 and 1, or null if no sentiment
   */
  convertCategoricalSentiment(sentiment) {
    if (!sentiment) return null;

    const sentimentLower = sentiment.toLowerCase();

    switch (sentimentLower) {
      case 'positive':
        return 0.7;   // Positive sentiment (maps to 0.8 score in scoreNewsSentiment)
      case 'negative':
        return -0.7;  // Negative sentiment (maps to 0.2 score)
      case 'neutral':
        return 0.0;   // Neutral sentiment (maps to 0.5 score)
      case 'mixed':
        return 0.0;   // Mixed sentiment treated as neutral (maps to 0.5 score)
      default:
        console.log(`[QUALITY] Unknown sentiment value: ${sentiment}, treating as neutral`);
        return 0.0;
    }
  }

  /**
   * Calculate trade quality grade
   * @param {string} symbol - Stock symbol
   * @param {Date} entryTime - Trade entry time
   * @param {number} entryPrice - Trade entry price
   * @param {string} side - Trade side ('long' or 'short')
   * @param {number} userId - User ID (optional, for custom quality weights)
   * @param {string} newsSentiment - Categorical news sentiment ('positive', 'negative', 'neutral', 'mixed')
   * @param {Object} instrument - Optional instrument info:
   *        { instrumentType, underlyingSymbol, strikePrice, expirationDate, optionType }
   * @returns {Promise<Object>} Quality grade and metrics
   */
  async calculateQuality(symbol, entryTime, entryPrice, side = 'long', userId = null, newsSentiment = null, instrument = {}) {
    if (!this.marketData.isConfigured()) {
      console.log(`[QUALITY] ${this.marketData.displayName} API key not configured, skipping quality calculation`);
      return {
        grade: null,
        reason: 'not_configured',
        message: `${this.marketData.displayName} market data is not configured.`
      };
    }

    // Futures are not gradeable - the configured market data providers have no
    // futures data, so there is nothing to score against
    const profileType = this.getProfileType(instrument?.instrumentType);
    if (!profileType) {
      console.log(`[QUALITY] ${symbol}: ${instrument?.instrumentType} instruments are not gradeable, skipping`);
      return {
        grade: null,
        reason: 'not_gradeable',
        message: `${instrument?.instrumentType || 'This instrument'} trades are not graded.`
      };
    }

    try {
      // Option trades are graded against the underlying - market data providers
      // have no profile/candle/news data for OCC contract symbols
      const isOption = profileType === 'option' && instrument?.underlyingSymbol;
      const dataSymbol = isOption ? instrument.underlyingSymbol : symbol;

      console.log(`[QUALITY] Calculating ${profileType} quality for ${symbol} at ${entryPrice}${userId ? ` (user ${userId})` : ''}${isOption ? ` using underlying ${dataSymbol}` : ''}`);
      console.log(`[QUALITY] Using provided news sentiment: ${newsSentiment || 'none'}`);

      // Convert categorical sentiment to numeric score
      const sentimentScore = this.convertCategoricalSentiment(newsSentiment);

      // Fetch user's quality weights and all required data in parallel
      // Use allSettled to continue even if some API calls fail
      // Note: Removed getNewsSentiment call - using provided sentiment instead
      const results = await Promise.allSettled([
        this.getUserQualityWeights(userId, profileType),
        this.getStockProfile(dataSymbol),
        this.getQuote(dataSymbol, entryTime),
        this.getBasicFinancials(dataSymbol)
      ]);

      // Extract successful results, use null/defaults for failures
      const weights = results[0].status === 'fulfilled'
        ? results[0].value
        : { ...QUALITY_PROFILES[profileType].defaults };
      const profile = results[1].status === 'fulfilled' ? results[1].value : null;
      const quote = results[2].status === 'fulfilled' ? results[2].value : null;
      const financials = results[3].status === 'fulfilled' ? results[3].value : null;

      // Create sentiment object from converted score
      const sentiment = sentimentScore !== null ? { sentiment: sentimentScore } : null;

      // Log any failures
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const apiName = ['weights', 'profile', 'quote', 'financials'][index];
          console.log(`[QUALITY] Failed to fetch ${apiName} for ${symbol}: ${result.reason?.message || result.reason}`);
        }
      });

      console.log(`[QUALITY] Data fetched for ${symbol}:`, {
        hasProfile: !!profile,
        hasQuote: !!quote,
        hasSentiment: !!sentiment,
        hasFinancials: !!financials,
        sentimentValue: sentiment,
        categoricalSentiment: newsSentiment
      });

      // Reference price for gap scoring (and price-range scoring on stocks).
      // For options the entry price is the premium, which is meaningless
      // against the underlying's close - use the underlying's open instead.
      const referencePrice = isOption ? (quote?.o || null) : entryPrice;

      // Calculate gap from previous day's close to the reference price
      const gap = (quote?.previousClose && referencePrice)
        ? ((referencePrice - quote.previousClose) / quote.previousClose) * 100
        : null;

      console.log(`[QUALITY] Gap calculation for ${dataSymbol}: referencePrice=${referencePrice}, previousClose=${quote?.previousClose}, gap=${gap?.toFixed(2)}%`);

      // Shared metrics (both profiles): news sentiment, gap, relative volume
      const metricScores = {
        newsSentiment: this.scoreNewsSentiment(sentiment, side),
        gap: this.scoreGap(gap),
        relativeVolume: this.scoreRelativeVolume(quote, financials?.avgVolume10Day)
      };

      // Actual relative volume ratio for display
      const actualVolume = quote?.v || null;
      const avgVolume = financials?.avgVolume10Day || null;
      // avgVolume is in millions, so convert to actual shares before calculating ratio
      const relativeVolumeRatio = (actualVolume && avgVolume && avgVolume > 0)
        ? actualVolume / (avgVolume * 1000000)
        : null;

      // Raw values recorded alongside scores in the metrics breakdown
      const metricValues = {
        newsSentiment: sentiment?.sentiment ?? null,
        gap,
        relativeVolume: relativeVolumeRatio
      };

      if (isOption) {
        // Option-specific metrics derived from the trade itself
        const dte = this.computeDaysToExpiration(entryTime, instrument.expirationDate);
        const spot = quote?.o ?? quote?.c ?? null;
        const moneyness = this.computeMoneyness(spot, instrument.strikePrice, instrument.optionType);

        metricScores.dte = this.scoreDte(dte);
        metricScores.moneyness = this.scoreMoneyness(moneyness);
        metricValues.dte = dte;
        metricValues.moneyness = moneyness;
      } else {
        // Stock-specific metrics: float and price range
        const sharesOutstanding = profile?.shareOutstanding || financials?.sharesOutstanding || null;
        if (!sharesOutstanding) {
          console.log(`[QUALITY] WARNING: No shares outstanding data found for ${dataSymbol}`);
        }
        metricScores.float = this.scoreFloat(sharesOutstanding);
        metricScores.priceRange = this.scorePriceRange(referencePrice);
        metricValues.float = sharesOutstanding;
        metricValues.priceRange = referencePrice;
      }

      console.log(`[QUALITY] Individual ${profileType} scores calculated:`, metricScores);

      // Weight only the metrics belonging to this profile, excluding metrics
      // with no data and renormalizing the remaining weights
      const profileMetricKeys = QUALITY_PROFILES[profileType].metrics;
      const scopedScores = {};
      for (const key of profileMetricKeys) scopedScores[key] = metricScores[key];

      const { score: weightedScore, coverage } = this.calculateWeightedScore(scopedScores, weights);

      if (weightedScore === null) {
        const coveragePct = Math.round(coverage * 100);
        const missingMetrics = profileMetricKeys
          .filter(key => scopedScores[key] === null || scopedScores[key] === undefined)
          .map(key => METRIC_LABELS[key]);
        console.log(`[QUALITY] ${symbol}: only ${coveragePct}% of weight has data (minimum ${MIN_COVERAGE * 100}%), not grading`);
        return {
          grade: null,
          reason: 'insufficient_data',
          coverage,
          missingMetrics,
          message: `Not enough market data for ${symbol}: only ${coveragePct}% of the metric weight had data (needs ${MIN_COVERAGE * 100}%).` +
            (missingMetrics.length ? ` No data for ${missingMetrics.join(', ')}.` : '')
        };
      }

      // Determine grade
      const grade = this.scoreToGrade(weightedScore);

      console.log(`[QUALITY] ${symbol} quality: ${grade} (${weightedScore.toFixed(2)}/5.0)`);
      console.log(`[QUALITY] Volume data: actual=${actualVolume}, 10-day avg=${avgVolume}, relative=${relativeVolumeRatio?.toFixed(2)}x`);

      // Build the stored metrics breakdown - raw value + score per metric
      const storedMetrics = {
        profile: profileType,
        dataSymbol: isOption ? dataSymbol : undefined,
        coverage: Math.round(coverage * 100) / 100,
        // Flag when the underlying price came from a real-time quote rather than
        // the entry-day candle, so strike distance can be shown as approximate
        spotSource: quote?.isLiveFallback ? 'live' : 'historical'
      };
      for (const key of profileMetricKeys) {
        const [valueField, scoreField] = STORED_METRIC_FIELDS[key];
        storedMetrics[valueField] = metricValues[key] ?? null;
        storedMetrics[scoreField] = metricScores[key];
      }

      return {
        grade,
        score: Math.round(weightedScore * 10) / 10, // Round to 1 decimal
        metrics: storedMetrics
      };
    } catch (error) {
      console.error(`[QUALITY] Error calculating quality for ${symbol}:`, error.message);
      console.error(`[QUALITY] Stack trace:`, error.stack);

      // No fabricated fallback grade - an ungraded trade can be recalculated
      // later, a fake neutral C cannot be told apart from a real one
      const timedOut = /timed out|timeout/i.test(error.message || '');
      return {
        grade: null,
        reason: timedOut ? 'api_timeout' : 'api_error',
        message: timedOut
          ? `Market data request for ${symbol} timed out. The provider may be rate-limiting or slow; try again.`
          : `Market data request for ${symbol} failed: ${error.message}`
      };
    }
  }

  /**
   * Get stock profile from the configured market data provider
   * Uses company-profile endpoint for more comprehensive data including float
   */
  async getStockProfile(symbol) {
    try {
      const profileData = await this.marketData.getCompanyProfile(symbol);

      // Log what we received
      console.log(`[QUALITY] Profile data for ${symbol}:`, {
        shareOutstanding: profileData?.shareOutstanding,
        marketCapitalization: profileData?.marketCapitalization,
        name: profileData?.name
      });

      // Return profile data with shareOutstanding (float)
      return profileData;
    } catch (error) {
      console.error(`[QUALITY] Error fetching profile for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get basic financials including 10-day average volume and shares outstanding
   */
  async getBasicFinancials(symbol) {
    try {
      const response = await this.marketData.getBasicFinancials(symbol);
      const metrics = response?.metric || {};
      const avgVolume10Day = metrics['10DayAverageTradingVolume'];
      const sharesOutstanding = metrics['sharesOutstanding'];

      console.log(`[QUALITY] Basic financials for ${symbol}:`, {
        '10DayAvgVolume': avgVolume10Day,
        'sharesOutstanding': sharesOutstanding
      });

      return {
        avgVolume10Day: avgVolume10Day || null,
        sharesOutstanding: sharesOutstanding || null
      };
    } catch (error) {
      console.error(`[QUALITY] Error fetching basic financials for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get stock quote data for a specific date (historical)
   * Uses candlestick data to get OHLCV for the trade entry date and previous day
   */
  async getQuote(symbol, entryTime) {
    try {
      // Convert entryTime to Unix timestamp (seconds)
      const entryDate = new Date(entryTime);
      if (isNaN(entryDate.getTime())) {
        console.log(`[QUALITY] Invalid entry time for ${symbol}, cannot fetch quote`);
        return null;
      }

      // Get data for 2 days (current day and previous day) to calculate gap
      const startDate = new Date(entryDate);
      startDate.setDate(startDate.getDate() - 2); // Go back 2 days to ensure we get previous trading day
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(entryDate);
      endDate.setHours(23, 59, 59, 999);

      const from = Math.floor(startDate.getTime() / 1000);
      const to = Math.floor(endDate.getTime() / 1000);

      // The daily candle endpoint can be empty (entry day not published yet) OR
      // throw (timeout / not available on the provider's free tier). Treat both
      // the same way and fall back to a real-time quote below.
      let candles = null;
      try {
        candles = await this.marketData.getStockCandles(symbol, 'D', from, to);
      } catch (candleError) {
        console.log(`[QUALITY] Candle fetch failed for ${symbol}: ${candleError.message}`);
      }

      if (Array.isArray(candles) && candles.length > 0) {
        // Get the most recent day's data (last element)
        const lastIndex = candles.length - 1;
        const latest = candles[lastIndex];
        const previousClose = lastIndex > 0 ? candles[lastIndex - 1].close : null;

        console.log(`[QUALITY] Historical data for ${symbol}: open=${latest.open}, close=${latest.close}, previousClose=${previousClose}`);

        return {
          o: latest.open,
          h: latest.high,
          l: latest.low,
          c: latest.close,
          v: latest.volume,
          previousClose,
          relativeVolume: null // Will need additional API call for average volume
        };
      }

      // No usable candle. Fall back to a real-time quote so strike distance
      // (and gap for very recent entries) can still be scored. The quote
      // endpoint works on tiers where the candle endpoint does not.
      console.log(`[QUALITY] No candle data for ${symbol} on ${entryDate.toISOString()}, trying live quote`);
      return await this.fetchLiveQuoteFallback(symbol, entryDate);
    } catch (error) {
      console.error(`[QUALITY] Error fetching historical quote for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Real-time quote fallback for when the daily candle is unavailable (entry
   * day not published yet, or the provider tier doesn't serve candles).
   * Always provides spot for option strike-distance scoring. The quote's
   * previous close is only a valid gap reference when the trade was entered
   * essentially today, so gap is left out for older entries. Daily volume is
   * not in a quote, so relative volume stays excluded.
   * @param {string} symbol - Symbol to quote (underlying for options)
   * @param {Date} entryDate - Trade entry date (to decide if gap is meaningful)
   * @returns {Promise<Object|null>} Quote-shaped object, or null on failure
   */
  async fetchLiveQuoteFallback(symbol, entryDate) {
    try {
      const q = await this.marketData.getQuote(symbol);
      if (!q || (q.c == null && q.o == null)) return null;
      const spot = q.c ?? q.o;

      // The live quote's previous close belongs to the current session, so it
      // is only a correct gap reference for a trade entered in the last day or
      // two. For older (still-open) trades, current spot is a usable proxy for
      // strike distance but the gap would be wrong, so omit it.
      const ageDays = (Date.now() - entryDate.getTime()) / 86400000;
      const gapValid = ageDays >= 0 && ageDays <= 2;

      console.log(`[QUALITY] Using live quote fallback for ${symbol}: spot=${spot}, previousClose=${gapValid ? q.pc : 'omitted (stale)'}`);
      return {
        o: spot,
        h: q.h ?? null,
        l: q.l ?? null,
        c: spot,
        v: null,              // live quote carries no daily volume -> relative volume stays N/A
        previousClose: gapValid ? (q.pc ?? null) : null,
        relativeVolume: null,
        isLiveFallback: true
      };
    } catch (error) {
      console.log(`[QUALITY] Live quote fallback failed for ${symbol}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get news sentiment from the configured market data provider using keyword analysis.
   */
  async getNewsSentiment(symbol, entryTime) {
    try {
      return await this.getNewsSentimentFromKeywords(symbol, entryTime);
    } catch (error) {
      console.error(`[QUALITY] Error fetching sentiment for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Fallback method: Get sentiment from company news using keyword analysis
   */
  async getNewsSentimentFromKeywords(symbol, entryTime) {
    try {
      // Get news for the trade date and day before
      const tradeDate = new Date(entryTime);
      const toDate = tradeDate.toISOString().split('T')[0];
      const fromDate = new Date(tradeDate.getTime() - 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

      const articles = await this.marketData.getCompanyNews(symbol, fromDate, toDate) || [];

      if (articles.length === 0) {
        console.log(`[QUALITY] No news articles found for ${symbol} between ${fromDate} and ${toDate}`);
        return { sentiment: 0 }; // Neutral
      }

      // Analyze sentiment using keywords
      let positiveCount = 0;
      let negativeCount = 0;

      articles.slice(0, 10).forEach(article => {
        const text = (article.headline + ' ' + (article.summary || '')).toLowerCase();
        const sentiment = this.analyzeKeywordSentiment(text);

        if (sentiment === 'positive') positiveCount++;
        else if (sentiment === 'negative') negativeCount++;
      });

      const total = Math.min(articles.length, 10);
      const sentimentScore = total > 0 ? (positiveCount - negativeCount) / total : 0;

      console.log(`[QUALITY] Keyword sentiment for ${symbol}: ${positiveCount} positive, ${negativeCount} negative out of ${total} articles, score=${sentimentScore}`);

      return { sentiment: sentimentScore };

    } catch (error) {
      console.error(`[QUALITY] Error in keyword sentiment analysis for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Analyze text sentiment using financial keywords
   */
  analyzeKeywordSentiment(text) {
    // Strong positive indicators
    const strongPositive = [
      'beat estimates', 'exceeded expectations', 'surpassed forecasts', 'record revenue',
      'record earnings', 'record profit', 'strong earnings', 'earnings beat',
      'breakthrough', 'milestone', 'major contract', 'blockbuster deal',
      'upgraded to buy', 'price target raised', 'fda approval', 'regulatory approval'
    ];

    // Moderate positive indicators
    const moderatePositive = [
      'growth', 'expansion', 'profit', 'gains', 'surge', 'rally', 'climb',
      'advance', 'rise', 'increase', 'improve', 'bullish', 'optimistic'
    ];

    // Strong negative indicators
    const strongNegative = [
      'missed estimates', 'below expectations', 'disappointing', 'guidance cut',
      'downgraded', 'lawsuit', 'investigation', 'fraud', 'bankruptcy', 'default',
      'recall', 'scandal', 'plunge', 'crash', 'collapse', 'suspended'
    ];

    // Moderate negative indicators
    const moderateNegative = [
      'decline', 'drop', 'fall', 'decrease', 'loss', 'weak', 'concern',
      'risk', 'bearish', 'pessimistic', 'uncertainty', 'volatile'
    ];

    let score = 0;

    // Check strong indicators first (weight: 3)
    strongPositive.forEach(term => {
      if (text.includes(term)) score += 3;
    });
    strongNegative.forEach(term => {
      if (text.includes(term)) score -= 3;
    });

    // Check moderate indicators (weight: 1)
    moderatePositive.forEach(term => {
      if (text.includes(term)) score += 1;
    });
    moderateNegative.forEach(term => {
      if (text.includes(term)) score -= 1;
    });

    if (score > 2) return 'positive';
    if (score < -2) return 'negative';
    return 'neutral';
  }

  /**
   * Score float (shares outstanding)
   * Ideal: < 1M, Acceptable: < 5M, Poor: > 5M
   * @returns {number} Score from 0 to 1
   */
  scoreFloat(floatShares) {
    if (!floatShares) return null; // No data - excluded from weighting

    // Finnhub returns shares outstanding already in millions
    // So we use the value as-is
    const floatInMillions = floatShares;

    if (floatInMillions < 1) return 1.0;      // Ideal
    if (floatInMillions < 5) return 0.7;      // Acceptable
    if (floatInMillions < 10) return 0.4;     // Marginal
    if (floatInMillions < 20) return 0.2;     // Poor
    return 0.1;                                // Very poor
  }

  /**
   * Score relative volume
   * Ideal: >= 5x, Acceptable: >= 3x, Poor: < 2x
   * @param {Object} quote - Historical quote data with volume
   * @param {number} avgVolume10Day - 10-day average trading volume
   * @returns {number} Score from 0 to 1
   */
  scoreRelativeVolume(quote, avgVolume10Day) {
    if (!quote || !quote.v || !avgVolume10Day || avgVolume10Day <= 0) {
      return null; // No data - excluded from weighting
    }

    const actualVolume = quote.v;
    // Finnhub returns avgVolume10Day in millions, so convert to actual shares
    const avgVolumeInShares = avgVolume10Day * 1000000;
    const relativeVolume = actualVolume / avgVolumeInShares;

    // Score based on relative volume multiples
    if (relativeVolume >= 5.0) return 1.0;      // Excellent - 5x+ average volume
    if (relativeVolume >= 3.0) return 0.8;      // Good - 3x+ average volume
    if (relativeVolume >= 2.0) return 0.6;      // Moderate - 2x+ average volume
    if (relativeVolume >= 1.0) return 0.4;      // Average volume
    if (relativeVolume >= 0.5) return 0.3;      // Below average
    return 0.2;                                  // Very low volume
  }

  /**
   * Score price range
   * Ideal: $2-20, Acceptable: $1-30, Poor: outside range
   * @returns {number} Score from 0 to 1
   */
  scorePriceRange(price) {
    if (!price) return null; // No data - excluded from weighting

    if (price >= 2 && price <= 20) return 1.0;    // Ideal
    if (price >= 1 && price < 2) return 0.7;      // Low but acceptable
    if (price > 20 && price <= 30) return 0.7;    // High but acceptable
    if (price > 30 && price <= 50) return 0.4;    // Marginal
    if (price < 1) return 0.3;                    // Too low
    return 0.2;                                    // Too high
  }

  /**
   * Days to expiration at trade entry.
   * @param {Date|string} entryTime - Trade entry time
   * @param {Date|string} expirationDate - Option expiration date
   * @returns {number|null} Whole days to expiration, or null if not computable
   */
  computeDaysToExpiration(entryTime, expirationDate) {
    if (!entryTime || !expirationDate) return null;
    const entry = new Date(entryTime);
    const expiry = new Date(expirationDate);
    if (isNaN(entry.getTime()) || isNaN(expiry.getTime())) return null;

    // Compare calendar dates (ignore intraday time) so a same-day 0DTE reads as 0
    const entryDay = Date.UTC(entry.getUTCFullYear(), entry.getUTCMonth(), entry.getUTCDate());
    const expiryDay = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
    const days = Math.round((expiryDay - entryDay) / (1000 * 60 * 60 * 24));

    return days >= 0 ? days : null;
  }

  /**
   * Score days to expiration.
   * Rewards swing-friendly tenor and penalizes very short (gamma/theta risk)
   * and very long (capital-inefficient) holding windows.
   * @param {number} dte - Days to expiration
   * @returns {number|null} Score from 0 to 1, or null if no data
   */
  scoreDte(dte) {
    if (dte === null || dte === undefined) return null; // No data - excluded from weighting

    if (dte <= 1) return 0.2;       // 0-1 DTE - high gamma/theta risk
    if (dte <= 7) return 0.5;       // Weekly - elevated theta decay
    if (dte <= 21) return 0.8;      // 1-3 weeks - room to be right
    if (dte <= 45) return 1.0;      // 3-6 weeks - swing sweet spot
    if (dte <= 90) return 0.7;      // 6-13 weeks - acceptable
    if (dte <= 180) return 0.5;     // Up to 6 months - capital tied up
    return 0.3;                     // LEAPS - inefficient for most setups
  }

  /**
   * Moneyness as a signed percentage of how far in-the-money the strike is at
   * entry. Positive = in the money, negative = out of the money, for both
   * calls and puts.
   * @param {number} spot - Underlying spot price at entry
   * @param {number} strike - Option strike price
   * @param {string} optionType - 'call' or 'put'
   * @returns {number|null} ITM percentage, or null if not computable
   */
  computeMoneyness(spot, strike, optionType) {
    if (!spot || !strike || spot <= 0) return null;
    const raw = ((spot - strike) / spot) * 100; // positive = call ITM
    if (optionType === 'put') return -raw;       // puts are ITM when spot < strike
    if (optionType === 'call') return raw;
    return null; // unknown option type - cannot interpret direction
  }

  /**
   * Score strike distance from spot (moneyness).
   * Near-the-money strikes get the best score (balanced delta and premium);
   * deep ITM ties up capital, far OTM is a low-probability lottery ticket.
   * @param {number} moneyness - Signed ITM percentage (positive = ITM)
   * @returns {number|null} Score from 0 to 1, or null if no data
   */
  scoreMoneyness(moneyness) {
    if (moneyness === null || moneyness === undefined) return null; // No data - excluded

    if (moneyness >= 10) return 0.5;       // Deep ITM - capital heavy, low leverage
    if (moneyness >= 2) return 0.8;        // Moderately ITM
    if (moneyness >= -2) return 1.0;       // Near the money - balanced
    if (moneyness >= -10) return 0.7;      // Slightly OTM - common directional play
    if (moneyness >= -20) return 0.4;      // Far OTM - low probability
    return 0.2;                            // Very far OTM - lottery ticket
  }

  /**
   * Score gap from previous day's close to entry price
   * Measures how much the stock has moved from previous close to entry point
   * @param {number} gap - Gap percentage (positive = gapping up, negative = gapping down)
   * @returns {number} Score from 0 to 1
   */
  scoreGap(gap) {
    if (gap === null || gap === undefined) return null; // No data - excluded from weighting

    // Positive gaps (stock gapping up from previous close)
    if (gap >= 10) return 1.0;      // Excellent - A setup (10%+ gap up)
    if (gap >= 5) return 0.8;       // Good - (5%+ gap up)
    if (gap >= 2) return 0.6;       // Moderate - (2%+ gap up)
    if (gap >= 0) return 0.4;       // Slight gap up or flat

    // Negative gaps (stock gapping down from previous close)
    return 0.2;                      // Gapping down
  }

  /**
   * Score news sentiment
   * Positive sentiment is heavily weighted for longs, negative for shorts
   * @param {Object} sentiment - Sentiment object with numeric sentiment score
   * @param {string} side - Trade side ('long' or 'short')
   * @returns {number} Score from 0 to 1
   */
  scoreNewsSentiment(sentiment, side = 'long') {
    if (!sentiment || sentiment.sentiment === undefined || sentiment.sentiment === null) {
      return null; // No data - excluded from weighting
    }

    const score = sentiment.sentiment || 0;
    const isShort = side?.toLowerCase() === 'short';

    // For LONG positions: positive news = good, negative news = bad
    // For SHORT positions: negative news = good, positive news = bad
    let qualityScore;

    if (score >= 0.7) {
      qualityScore = 1.0;      // Very positive news (strongly bullish)
    } else if (score >= 0.4) {
      qualityScore = 0.8;      // Positive news (bullish)
    } else if (score > 0.1) {
      qualityScore = 0.6;      // Slightly positive news
    } else if (score >= -0.1) {
      qualityScore = 0.5;      // Neutral news (between -0.1 and 0.1)
    } else if (score >= -0.4) {
      qualityScore = 0.4;      // Slightly negative news
    } else if (score >= -0.7) {
      qualityScore = 0.2;      // Negative news (bearish)
    } else {
      qualityScore = 0.1;      // Very negative news (strongly bearish)
    }

    // Reverse the score for short positions
    if (isShort) {
      qualityScore = 1.0 - qualityScore + 0.1; // Invert but keep some range
      qualityScore = Math.max(0.1, Math.min(1.0, qualityScore)); // Clamp to 0.1-1.0
    }

    return qualityScore;
  }

  /**
   * Calculate weighted score using custom or default weights
   * Metrics with a null score (no data) are excluded and the remaining
   * weights are renormalized so they still sum to 1.0
   * @param {Object} metrics - Individual metric scores (0-1 scale, null = no data)
   * @param {Object} weights - Custom weight percentages (as decimals, should sum to 1.0)
   * @returns {Object} { score, coverage } - score on 0-5 scale (null if coverage below MIN_COVERAGE),
   *                   coverage = share of total weight backed by real data (0-1)
   */
  calculateWeightedScore(metrics, weights = null) {
    // Use provided weights or fall back to defaults
    const finalWeights = weights || {
      newsSentiment: 0.30,    // Default 30%
      gap: 0.20,              // Default 20%
      relativeVolume: 0.20,   // Default 20%
      float: 0.15,            // Default 15%
      priceRange: 0.15        // Default 15%
    };

    let weightedSum = 0;
    let coverage = 0;

    // Weight every metric present in the supplied weights map - this is
    // profile-agnostic, so it handles both the stock metric set and the
    // option metric set (dte, moneyness)
    for (const key of Object.keys(finalWeights)) {
      const metricScore = metrics[key];
      if (metricScore === null || metricScore === undefined) continue;
      weightedSum += metricScore * finalWeights[key];
      coverage += finalWeights[key];
    }

    if (coverage < MIN_COVERAGE) {
      return { score: null, coverage };
    }

    // Renormalize so excluded metrics don't drag the score toward zero
    return { score: (weightedSum / coverage) * 5, coverage };
  }

  /**
   * Recalculate the weighted score and grade from a trade's stored
   * quality_metrics, without any API calls. Used to reapply new weights to
   * already-graded trades. A metric counts as available only when its raw
   * value was recorded - legacy rows stored neutral default scores (0.5)
   * alongside null raw values, and those are excluded here.
   *
   * The metric set is chosen from the profile recorded on the stored metrics
   * (defaults to stock for legacy rows that predate profiles).
   * @param {Object} storedMetrics - quality_metrics JSONB from the trade
   * @param {Object} weights - Weights as decimals for the matching profile
   * @returns {Object|null} { grade, score, coverage } or null if metrics unusable
   */
  recalculateFromStoredMetrics(storedMetrics, weights) {
    if (!storedMetrics || typeof storedMetrics !== 'object') return null;

    const available = (rawValue, score) =>
      rawValue !== null && rawValue !== undefined && score !== null && score !== undefined
        ? Number(score)
        : null;

    const profileType = QUALITY_PROFILES[storedMetrics.profile] ? storedMetrics.profile : 'stock';
    const metricKeys = QUALITY_PROFILES[profileType].metrics;

    const metrics = {};
    for (const key of metricKeys) {
      const [valueField, scoreField] = STORED_METRIC_FIELDS[key];
      metrics[key] = available(storedMetrics[valueField], storedMetrics[scoreField]);
    }

    const { score, coverage } = this.calculateWeightedScore(metrics, weights);

    if (score === null) {
      return { grade: null, score: null, coverage, profileType };
    }

    return {
      grade: this.scoreToGrade(score),
      score: Math.round(score * 10) / 10,
      coverage,
      profileType
    };
  }

  /**
   * Reapply the user's current quality weights to every trade that already
   * has a stored metrics breakdown. Pure math over stored data - no API
   * calls - so weight changes take effect immediately. Each trade is graded
   * with the weights of the profile recorded on its stored metrics.
   * @param {string} userId - User ID
   * @returns {Promise<number>} Number of trades updated
   */
  async reapplyUserWeights(userId) {
    // Load each profile's weights once
    const weightsByProfile = {};
    for (const profileType of Object.keys(QUALITY_PROFILES)) {
      weightsByProfile[profileType] = await this.getUserQualityWeights(userId, profileType);
    }

    const result = await db.query(
      `SELECT id, quality_metrics FROM trades WHERE user_id = $1 AND quality_metrics IS NOT NULL`,
      [userId]
    );

    const ids = [];
    const grades = [];
    const scores = [];

    for (const row of result.rows) {
      const profileType = QUALITY_PROFILES[row.quality_metrics?.profile] ? row.quality_metrics.profile : 'stock';
      const recalculated = this.recalculateFromStoredMetrics(row.quality_metrics, weightsByProfile[profileType]);
      if (!recalculated) continue;
      ids.push(row.id);
      grades.push(recalculated.grade);
      scores.push(recalculated.score);
    }

    if (ids.length > 0) {
      await db.query(
        `UPDATE trades t
         SET quality_grade = u.grade,
             quality_score = u.score
         FROM (
           SELECT unnest($1::uuid[]) AS id,
                  unnest($2::varchar[]) AS grade,
                  unnest($3::numeric[]) AS score
         ) u
         WHERE t.id = u.id AND t.user_id = $4`,
        [ids, grades, scores, userId]
      );
    }

    console.log(`[QUALITY] Reapplied weights for user ${userId}: ${ids.length} trades re-graded`);
    return ids.length;
  }

  /**
   * Convert numeric score to letter grade
   * 5/5 = A, 4/5 = B, 3/5 = C, 2/5 = D, 0-1/5 = F
   */
  scoreToGrade(score) {
    if (score >= 4.5) return 'A';
    if (score >= 3.5) return 'B';
    if (score >= 2.5) return 'C';
    if (score >= 1.5) return 'D';
    return 'F';
  }

  /**
   * Batch calculate quality for multiple trades
   * @param {Array} trades - Array of trade objects with symbol, entry_time, entry_price, user_id
   * @returns {Promise<Array>} Array of quality results
   */
  async calculateBatchQuality(trades) {
    const results = [];

    for (const trade of trades) {
      const quality = await this.calculateQuality(
        trade.symbol,
        trade.entry_time,
        trade.entry_price,
        trade.side || 'long',
        trade.user_id,
        trade.news_sentiment || null,
        {
          instrumentType: trade.instrument_type,
          underlyingSymbol: trade.underlying_symbol,
          strikePrice: trade.strike_price,
          expirationDate: trade.expiration_date,
          optionType: trade.option_type
        }
      );

      results.push({
        tradeId: trade.id,
        quality
      });

      // Add small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }
}

module.exports = new TradeQualityService();
