const axios = require('axios');
const db = require('../config/database');

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
 * Scoring: 5/5 = A, 4/5 = B, 3/5 = C, 2/5 = D, 0-1/5 = F
 */

class TradeQualityService {
  constructor() {
    this.finnhubApiKey = process.env.FINNHUB_API_KEY;
    this.baseUrl = 'https://finnhub.io/api/v1';
  }

  /**
   * Get user's quality weight preferences from database
   * Falls back to default weights if user not found or weights not set
   * @param {number} userId - User ID
   * @returns {Promise<Object>} User's quality weights (percentages as decimals)
   */
  async getUserQualityWeights(userId) {
    try {
      // Default weights (matching database defaults)
      const defaultWeights = {
        newsSentiment: 0.30,
        gap: 0.20,
        relativeVolume: 0.20,
        float: 0.15,
        priceRange: 0.15
      };

      // If no userId provided, return defaults
      if (!userId) {
        console.log('[QUALITY] No userId provided, using default weights');
        return defaultWeights;
      }

      // Fetch user's custom weights from database
      const query = `
        SELECT
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
        console.log(`[QUALITY] User ${userId} not found, using default weights`);
        return defaultWeights;
      }

      const userWeights = result.rows[0];

      // Convert from percentage integers (0-100) to decimals (0-1)
      const weights = {
        newsSentiment: (userWeights.quality_weight_news || 30) / 100,
        gap: (userWeights.quality_weight_gap || 20) / 100,
        relativeVolume: (userWeights.quality_weight_relative_volume || 20) / 100,
        float: (userWeights.quality_weight_float || 15) / 100,
        priceRange: (userWeights.quality_weight_price_range || 15) / 100
      };

      console.log(`[QUALITY] User ${userId} custom weights:`, {
        news: `${userWeights.quality_weight_news}%`,
        gap: `${userWeights.quality_weight_gap}%`,
        relativeVolume: `${userWeights.quality_weight_relative_volume}%`,
        float: `${userWeights.quality_weight_float}%`,
        priceRange: `${userWeights.quality_weight_price_range}%`
      });

      return weights;
    } catch (error) {
      console.error('[QUALITY] Error fetching user quality weights:', error.message);
      // Return defaults on error
      return {
        newsSentiment: 0.30,
        gap: 0.20,
        relativeVolume: 0.20,
        float: 0.15,
        priceRange: 0.15
      };
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
   * @returns {Promise<Object>} Quality grade and metrics
   */
  async calculateQuality(symbol, entryTime, entryPrice, side = 'long', userId = null, newsSentiment = null) {
    if (!this.finnhubApiKey) {
      console.log('[QUALITY] Finnhub API key not configured, skipping quality calculation');
      return null;
    }

    try {
      console.log(`[QUALITY] Calculating quality for ${symbol} at ${entryPrice}${userId ? ` (user ${userId})` : ''}`);
      console.log(`[QUALITY] Using provided news sentiment: ${newsSentiment || 'none'}`);

      // Convert categorical sentiment to numeric score
      const sentimentScore = this.convertCategoricalSentiment(newsSentiment);

      // Fetch user's quality weights and all required data in parallel
      // Use allSettled to continue even if some API calls fail
      // Note: Removed getNewsSentiment call - using provided sentiment instead
      const results = await Promise.allSettled([
        this.getUserQualityWeights(userId),
        this.getStockProfile(symbol),
        this.getQuote(symbol, entryTime),
        this.getBasicFinancials(symbol)
      ]);

      // Extract successful results, use null/defaults for failures
      const weights = results[0].status === 'fulfilled' ? results[0].value : {
        newsSentiment: 0.30,
        gap: 0.20,
        relativeVolume: 0.20,
        float: 0.15,
        priceRange: 0.15
      };
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

      // Get shares outstanding (float) - try profile first, then financials
      const sharesOutstanding = profile?.shareOutstanding || financials?.sharesOutstanding || null;

      if (!sharesOutstanding) {
        console.log(`[QUALITY] WARNING: No shares outstanding data found for ${symbol}`);
        console.log(`[QUALITY] Profile shareOutstanding: ${profile?.shareOutstanding}`);
        console.log(`[QUALITY] Financials sharesOutstanding: ${financials?.sharesOutstanding}`);
      } else {
        const source = profile?.shareOutstanding ? 'profile' : 'financials';
        console.log(`[QUALITY] Shares outstanding for ${symbol}: ${sharesOutstanding} (from ${source})`);
      }

      // Calculate gap from previous day's close to entry price
      const gap = (quote?.previousClose && entryPrice)
        ? ((entryPrice - quote.previousClose) / quote.previousClose) * 100
        : null;

      console.log(`[QUALITY] Gap calculation for ${symbol}: entryPrice=${entryPrice}, previousClose=${quote?.previousClose}, gap=${gap?.toFixed(2)}%`);

      // Calculate individual metric scores with error handling
      const metrics = {
        float: this.scoreFloat(sharesOutstanding),
        relativeVolume: this.scoreRelativeVolume(quote, financials?.avgVolume10Day),
        priceRange: this.scorePriceRange(entryPrice),
        gap: this.scoreGap(gap),
        newsSentiment: this.scoreNewsSentiment(sentiment, side)
      };

      console.log(`[QUALITY] Individual scores calculated:`, metrics);

      // Calculate weighted score using user's custom weights
      const weightedScore = this.calculateWeightedScore(metrics, weights);

      // Determine grade
      const grade = this.scoreToGrade(weightedScore);

      // Calculate actual relative volume ratio
      const actualVolume = quote?.v || null;
      const avgVolume = financials?.avgVolume10Day || null;
      // avgVolume is in millions, so convert to actual shares before calculating ratio
      const relativeVolumeRatio = (actualVolume && avgVolume && avgVolume > 0)
        ? actualVolume / (avgVolume * 1000000)
        : null;

      console.log(`[QUALITY] ${symbol} quality: ${grade} (${weightedScore.toFixed(2)}/5.0)`);
      console.log(`[QUALITY] Metrics:`, metrics);
      console.log(`[QUALITY] Volume data: actual=${actualVolume}, 10-day avg=${avgVolume}, relative=${relativeVolumeRatio?.toFixed(2)}x`);

      return {
        grade,
        score: Math.round(weightedScore * 10) / 10, // Round to 1 decimal
        metrics: {
          float: sharesOutstanding,
          floatScore: metrics.float,
          relativeVolume: relativeVolumeRatio,
          relativeVolumeScore: metrics.relativeVolume,
          price: entryPrice,
          priceScore: metrics.priceRange,
          gap: gap,
          gapScore: metrics.gap,
          newsSentiment: sentiment?.sentiment || null,
          newsSentimentScore: metrics.newsSentiment
        }
      };
    } catch (error) {
      console.error(`[QUALITY] Error calculating quality for ${symbol}:`, error.message);
      console.error(`[QUALITY] Stack trace:`, error.stack);

      // Return a fallback grade instead of null to prevent N/A results
      // This ensures trades always get a grade even when data is unavailable
      console.log(`[QUALITY] Returning fallback grade C for ${symbol} due to error`);
      return {
        grade: 'C',
        score: 3.0,
        metrics: {
          float: null,
          floatScore: 0,
          relativeVolume: null,
          relativeVolumeScore: 0.5,
          price: entryPrice,
          priceScore: 0.5,
          gap: null,
          gapScore: 0.5,
          newsSentiment: null,
          newsSentimentScore: 0.5
        }
      };
    }
  }

  /**
   * Get stock profile from Finnhub
   * Uses company-profile endpoint for more comprehensive data including float
   */
  async getStockProfile(symbol) {
    try {
      // Try company-profile endpoint first (has more detailed data) with retry logic
      const profileResponse = await this.retryWithBackoff(() =>
        axios.get(`${this.baseUrl}/stock/profile`, {
          params: {
            symbol,
            token: this.finnhubApiKey
          },
          timeout: 5000
        })
      );

      const profileData = profileResponse.data;

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

      // Fallback to profile2 endpoint if profile fails
      try {
        console.log(`[QUALITY] Trying fallback profile2 endpoint for ${symbol}`);
        const profile2Response = await this.retryWithBackoff(() =>
          axios.get(`${this.baseUrl}/stock/profile2`, {
            params: {
              symbol,
              token: this.finnhubApiKey
            },
            timeout: 5000
          })
        );

        console.log(`[QUALITY] Profile2 data for ${symbol}:`, {
          shareOutstanding: profile2Response.data?.shareOutstanding,
          marketCapitalization: profile2Response.data?.marketCapitalization
        });

        return profile2Response.data;
      } catch (fallbackError) {
        console.error(`[QUALITY] Both profile endpoints failed for ${symbol}:`, fallbackError.message);
        return null;
      }
    }
  }

  /**
   * Get basic financials including 10-day average volume and shares outstanding
   */
  async getBasicFinancials(symbol) {
    try {
      const response = await this.retryWithBackoff(() =>
        axios.get(`${this.baseUrl}/stock/metric`, {
          params: {
            symbol,
            metric: 'all',
            token: this.finnhubApiKey
          },
          timeout: 5000
        })
      );

      const metrics = response.data?.metric || {};
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

      // Get data for 2 days (current day and previous day) to calculate gap
      const startDate = new Date(entryDate);
      startDate.setDate(startDate.getDate() - 2); // Go back 2 days to ensure we get previous trading day
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(entryDate);
      endDate.setHours(23, 59, 59, 999);

      const from = Math.floor(startDate.getTime() / 1000);
      const to = Math.floor(endDate.getTime() / 1000);

      // Get daily candle data for the trade date and previous days with retry logic
      const response = await this.retryWithBackoff(() =>
        axios.get(`${this.baseUrl}/stock/candle`, {
          params: {
            symbol,
            resolution: 'D', // Daily candle
            from,
            to,
            token: this.finnhubApiKey
          },
          timeout: 5000
        })
      );

      const data = response.data;

      // Check if we have valid data
      if (!data || data.s !== 'ok' || !data.o || data.o.length === 0) {
        console.log(`[QUALITY] No historical data available for ${symbol} on ${entryDate.toISOString()}`);
        return null;
      }

      // Get the most recent day's data (last element)
      const lastIndex = data.o.length - 1;
      const open = data.o[lastIndex];
      const high = data.h[lastIndex];
      const low = data.l[lastIndex];
      const close = data.c[lastIndex];
      const volume = data.v[lastIndex];

      // Get previous day's close if available
      const previousClose = lastIndex > 0 ? data.c[lastIndex - 1] : null;

      console.log(`[QUALITY] Historical data for ${symbol}: open=${open}, close=${close}, previousClose=${previousClose}`);

      return {
        o: open,
        h: high,
        l: low,
        c: close,
        v: volume,
        previousClose,
        relativeVolume: null // Will need additional API call for average volume
      };
    } catch (error) {
      console.error(`[QUALITY] Error fetching historical quote for ${symbol}:`, error.message);
      return null;
    }
  }

  /**
   * Get news sentiment from Finnhub
   * First tries the news-sentiment API endpoint, falls back to keyword-based analysis
   */
  async getNewsSentiment(symbol, entryTime) {
    try {
      // First, try to get sentiment from Finnhub's news-sentiment endpoint with retry logic
      const sentimentResponse = await this.retryWithBackoff(() =>
        axios.get(`${this.baseUrl}/news-sentiment`, {
          params: {
            symbol,
            token: this.finnhubApiKey
          },
          timeout: 5000
        })
      );

      // Check if we have valid sentiment data
      if (sentimentResponse.data && sentimentResponse.data.sentiment) {
        const bullishPercent = sentimentResponse.data.sentiment.bullishPercent || 0;
        const bearishPercent = sentimentResponse.data.sentiment.bearishPercent || 0;

        // Convert bullish/bearish percentages to a sentiment score (-1 to 1)
        // If we have valid percentages, use them
        if (bullishPercent > 0 || bearishPercent > 0) {
          const sentimentScore = bullishPercent - bearishPercent;
          console.log(`[QUALITY] News sentiment API for ${symbol}: bullish=${bullishPercent}, bearish=${bearishPercent}, score=${sentimentScore}`);
          return { sentiment: sentimentScore };
        }
      }

      // Fallback: Use company news endpoint with keyword analysis
      console.log(`[QUALITY] No sentiment data from API for ${symbol}, falling back to keyword analysis`);
      return await this.getNewsSentimentFromKeywords(symbol, entryTime);

    } catch (error) {
      console.error(`[QUALITY] Error fetching sentiment for ${symbol}:`, error.message);

      // Try fallback to keyword-based analysis
      try {
        return await this.getNewsSentimentFromKeywords(symbol, entryTime);
      } catch (fallbackError) {
        console.error(`[QUALITY] Fallback sentiment analysis also failed:`, fallbackError.message);
        return null;
      }
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

      const newsResponse = await this.retryWithBackoff(() =>
        axios.get(`${this.baseUrl}/company-news`, {
          params: {
            symbol,
            from: fromDate,
            to: toDate,
            token: this.finnhubApiKey
          },
          timeout: 5000
        })
      );

      const articles = newsResponse.data || [];

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
    if (!floatShares) return 0;

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
    // If we don't have the required data, return neutral score
    if (!quote || !quote.v || !avgVolume10Day || avgVolume10Day <= 0) {
      return 0.5; // Default neutral score
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
    if (!price) return 0;

    if (price >= 2 && price <= 20) return 1.0;    // Ideal
    if (price >= 1 && price < 2) return 0.7;      // Low but acceptable
    if (price > 20 && price <= 30) return 0.7;    // High but acceptable
    if (price > 30 && price <= 50) return 0.4;    // Marginal
    if (price < 1) return 0.3;                    // Too low
    return 0.2;                                    // Too high
  }

  /**
   * Score gap from previous day's close to entry price
   * Measures how much the stock has moved from previous close to entry point
   * @param {number} gap - Gap percentage (positive = gapping up, negative = gapping down)
   * @returns {number} Score from 0 to 1
   */
  scoreGap(gap) {
    if (gap === null || gap === undefined) return 0.5; // Neutral if no data

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
    // No news data - use neutral score
    if (!sentiment || sentiment.sentiment === undefined || sentiment.sentiment === null) {
      return 0.5; // Neutral score when sentiment is not available
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
   * @param {Object} metrics - Individual metric scores (0-1 scale)
   * @param {Object} weights - Custom weight percentages (as decimals, should sum to 1.0)
   * @returns {number} Weighted score on 0-5 scale
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

    const score =
      metrics.newsSentiment * finalWeights.newsSentiment +
      metrics.float * finalWeights.float +
      metrics.relativeVolume * finalWeights.relativeVolume +
      metrics.priceRange * finalWeights.priceRange +
      metrics.gap * finalWeights.gap;

    return score * 5; // Convert to 0-5 scale
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
        trade.user_id
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
