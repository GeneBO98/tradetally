const db = require('../config/database');
const finnhub = require('../utils/finnhub');
const TierService = require('./tierService');
const logger = require('../utils/logger');
const globalEnrichmentCache = require('./globalEnrichmentCacheService');

class NewsEnrichmentService {
  constructor() {
    this.isProcessing = false;
    this.apiCallDelay = 2000; // 2 seconds between API calls to respect rate limits
  }

  /**
   * Check if news enrichment is enabled for user
   */
  async isNewsEnrichmentEnabled(userId) {
    try {
      // Check if billing is enabled
      const billingEnabled = await TierService.isBillingEnabled();
      
      if (!billingEnabled) {
        // Self-hosted with billing disabled - always enabled
        return true;
      }
      
      // Check user tier for SaaS users
      const userTier = await TierService.getUserTier(userId);
      return userTier === 'pro';
    } catch (error) {
      logger.logError(`Error checking news enrichment eligibility: ${error.message}`);
      return false;
    }
  }

  /**
   * Get news data from global cache or API
   */
  async getNewsForSymbolAndDate(symbol, date, userId = null) {
    try {
      // Check if news enrichment is enabled
      if (userId && !(await this.isNewsEnrichmentEnabled(userId))) {
        return {
          hasNews: false,
          newsEvents: [],
          sentiment: null,
          fromCache: false
        };
      }

      // Check if Finnhub is configured
      if (!finnhub.isConfigured()) {
        logger.logError('Finnhub not configured for news enrichment');
        return {
          hasNews: false,
          newsEvents: [],
          sentiment: null,
          fromCache: false
        };
      }

      const symbolUpper = symbol.toUpperCase();
      const newsDate = new Date(date).toISOString().split('T')[0];

      // Use global enrichment cache with API fallback
      const enrichmentResult = await globalEnrichmentCache.getEnrichmentWithFallback(
        symbolUpper, 
        newsDate, 
        async (sym, tradeDate) => await this.fetchNewsFromAPI(sym, tradeDate)
      );

      if (enrichmentResult.source === 'error') {
        return {
          hasNews: false,
          newsEvents: [],
          sentiment: null,
          fromCache: false,
          error: enrichmentResult.error
        };
      }

      const data = enrichmentResult.data;
      const newsEvents = data?.major_news_events || [];
      
      // Convert numeric sentiment back to string
      let sentiment = null;
      if (data?.news_sentiment !== null && data?.news_sentiment !== undefined) {
        if (data.news_sentiment > 0.1) sentiment = 'positive';
        else if (data.news_sentiment < -0.1) sentiment = 'negative';
        else sentiment = 'neutral';
      }

      return {
        hasNews: newsEvents.length > 0,
        newsEvents: newsEvents,
        sentiment: sentiment,
        fromCache: enrichmentResult.cached,
        source: enrichmentResult.source
      };

    } catch (error) {
      logger.logError(`Error getting news for ${symbol} on ${date}: ${error.message}`);
      return {
        hasNews: false,
        newsEvents: [],
        sentiment: null,
        fromCache: false,
        error: error.message
      };
    }
  }

  /**
   * Fetch news data from API (used by global cache service)
   */
  async fetchNewsFromAPI(symbol, tradeDate) {
    try {
      logger.logImport(`Fetching news for ${symbol} on ${tradeDate} from Finnhub`);
      
      // Get news for the trade date and day before
      const toDate = tradeDate;
      const fromDate = new Date(new Date(tradeDate).getTime() - 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

      const companyNews = await finnhub.getCompanyNews(symbol, fromDate, toDate);
      
      let processedNews = [];
      let numericSentiment = 0;

      if (companyNews && companyNews.length > 0) {
        // Filter and process news articles
        processedNews = companyNews
          .filter(article => article.headline && article.datetime)
          .slice(0, 10) // Limit to 10 articles
          .map(article => ({
            headline: article.headline,
            summary: article.summary || '',
            url: article.url,
            datetime: new Date(article.datetime * 1000).toISOString(),
            source: article.source,
            sentiment: this.analyzeSentiment(article.headline + ' ' + (article.summary || ''))
          }));

        // Calculate overall numeric sentiment for storage
        if (processedNews.length > 0) {
          const sentiments = processedNews.map(n => n.sentiment);
          const positive = sentiments.filter(s => s === 'positive').length;
          const negative = sentiments.filter(s => s === 'negative').length;
          const total = sentiments.length;
          
          // Convert to numeric score (-1.0 to 1.0)
          numericSentiment = (positive - negative) / total;
        }
      }

      // Also cache in legacy news_cache table for backward compatibility
      await this.cacheLegacyNews(symbol, tradeDate, processedNews, numericSentiment);

      // Return data for global cache
      return {
        news_sentiment: numericSentiment,
        news_count: processedNews.length,
        news_summary: processedNews.length > 0 ? 
          processedNews.map(n => n.headline).slice(0, 3).join('; ') : null,
        major_news_events: processedNews,
        data_sources: ['finnhub'],
        confidence_score: processedNews.length > 0 ? 90 : 100
      };

    } catch (error) {
      logger.logError(`Error fetching news from API for ${symbol}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cache news in legacy news_cache table for backward compatibility
   */
  async cacheLegacyNews(symbol, tradeDate, processedNews, numericSentiment) {
    try {
      // Convert numeric sentiment back to string for legacy table
      let stringSentiment = null;
      if (numericSentiment > 0.1) stringSentiment = 'positive';
      else if (numericSentiment < -0.1) stringSentiment = 'negative';
      else if (processedNews.length > 0) stringSentiment = 'neutral';

      const cacheInsertQuery = `
        INSERT INTO news_cache (symbol, news_date, news_events, sentiment)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (symbol, news_date) 
        DO UPDATE SET 
          news_events = EXCLUDED.news_events,
          sentiment = EXCLUDED.sentiment,
          checked_at = CURRENT_TIMESTAMP
      `;
      
      await db.query(cacheInsertQuery, [
        symbol.toUpperCase(), 
        tradeDate, 
        JSON.stringify(processedNews),
        stringSentiment
      ]);
    } catch (error) {
      logger.logError(`Error caching legacy news data: ${error.message}`);
      // Don't throw - this is just for backward compatibility
    }
  }

  /**
   * Comprehensive financial sentiment analysis
   */
  analyzeSentiment(text) {
    const lowerText = text.toLowerCase();
    
    // Strong positive indicators (weight: 3)
    const strongPositive = [
      // Earnings & Financial Performance
      'beat estimates', 'exceeded expectations', 'surpassed forecasts', 'record revenue',
      'record earnings', 'record profit', 'strong earnings', 'earnings beat',
      'revenue beat', 'blowout earnings', 'stellar results', 'impressive results',
      
      // Business Growth & Success
      'breakthrough', 'milestone', 'major contract', 'blockbuster deal',
      'game changer', 'market leader', 'dominant position', 'competitive advantage',
      'patent approval', 'fda approval', 'regulatory approval', 'strategic partnership',
      
      // Stock Performance & Analyst Actions
      'price target raised', 'upgraded to buy', 'upgraded to outperform',
      'initiated with buy', 'strong buy rating', 'target price increased',
      
      // Positive Corporate Actions
      'private placement', 'strategic investment', 'institutional investment',
      'insider buying', 'share buyback program', 'dividend increase',
      'special dividend', 'stock split', 'spin-off', 'buyback program',
      'share repurchase', 'dividend declared'
    ];

    // Moderate positive indicators (weight: 2)
    const moderatePositive = [
      // General positive terms
      'growth', 'expansion', 'profit', 'gains', 'surge', 'rally', 'climb',
      'advance', 'rise', 'increase', 'improve', 'strengthen', 'outperform',
      'exceed', 'beat', 'strong', 'robust', 'solid', 'healthy', 'positive',
      'bullish', 'optimistic', 'confident', 'promising', 'favorable',
      
      // Business metrics
      'revenue growth', 'margin expansion', 'cost savings', 'efficiency',
      'market share', 'customer growth', 'user growth', 'subscriber growth',
      'backlog', 'pipeline', 'demand', 'orders', 'bookings',
      
      // Corporate actions
      'acquisition', 'merger', 'joint venture', 'partnership', 'collaboration',
      'expansion', 'launch', 'new product', 'innovation', 'development',
      
      // Analyst sentiment
      'upgrade', 'outperform', 'buy rating', 'price target', 'recommendation',
      'analyst optimism', 'raised guidance', 'increased forecast'
    ];

    // Minor positive indicators (weight: 1)
    const minorPositive = [
      'up', 'higher', 'better', 'good', 'success', 'win', 'achieve',
      'progress', 'momentum', 'trend', 'recovery', 'rebound', 'stabilize'
    ];

    // Strong negative indicators (weight: 3)
    const strongNegative = [
      // Poor Financial Performance
      'missed estimates', 'missed expectations', 'disappointing results',
      'earnings miss', 'revenue miss', 'guidance cut', 'outlook lowered',
      'profit warning', 'loss widened', 'margin compression',
      
      // Regulatory & Legal Issues
      'sec investigation', 'lawsuit filed', 'class action', 'fraud allegations',
      'regulatory violation', 'compliance issues', 'penalty', 'fine imposed',
      'criminal charges', 'indictment', 'probe', 'scandal',
      
      // Dilutive Corporate Actions
      'registered direct offering', 'public offering', 'secondary offering',
      'shelf registration', 'warrant exercise', 'convertible debt',
      'dilutive financing', 'equity raise', 'at-the-market offering',
      'direct offering', 'rights offering', 'follow-on offering',
      
      // Business Problems
      'bankruptcy', 'chapter 11', 'insolvency', 'restructuring',
      'mass layoffs', 'plant closure', 'discontinued', 'recall',
      'cyber attack', 'data breach', 'hack', 'security incident',
      'investigation', 'sec investigation', 'probe launched',
      
      // Stock & Analyst Actions
      'downgraded to sell', 'price target cut', 'target lowered',
      'suspended coverage', 'removed from index', 'delisted'
    ];

    // Moderate negative indicators (weight: 2)
    const moderateNegative = [
      // General negative terms
      'decline', 'fall', 'drop', 'plunge', 'tumble', 'crash', 'collapse',
      'weak', 'poor', 'disappointing', 'concerning', 'troubling', 'challenging',
      'difficult', 'struggle', 'pressure', 'headwinds', 'obstacles',
      'bearish', 'pessimistic', 'negative', 'unfavorable',
      
      // Business issues
      'competition', 'market share loss', 'customer defection',
      'supply chain', 'shortage', 'disruption', 'delay', 'setback',
      'cost increase', 'inflation impact', 'margin pressure',
      
      // Financial stress
      'debt burden', 'cash burn', 'liquidity concerns', 'covenant breach',
      'credit rating', 'junk status', 'refinancing', 'distressed',
      
      // Analyst sentiment
      'downgrade', 'underperform', 'sell rating', 'reduced target',
      'lowered guidance', 'cut forecast', 'analyst concern'
    ];

    // Minor negative indicators (weight: 1)
    const minorNegative = [
      'down', 'lower', 'less', 'decrease', 'reduce', 'cut', 'loss',
      'concern', 'risk', 'uncertainty', 'volatile', 'caution'
    ];

    // Calculate weighted sentiment scores
    let positiveScore = 0;
    let negativeScore = 0;

    // Check strong positive (weight 3)
    strongPositive.forEach(phrase => {
      if (lowerText.includes(phrase)) positiveScore += 3;
    });

    // Check moderate positive (weight 2)
    moderatePositive.forEach(phrase => {
      if (lowerText.includes(phrase)) positiveScore += 2;
    });

    // Check minor positive (weight 1)
    minorPositive.forEach(word => {
      // Use word boundaries to avoid partial matches
      if (new RegExp(`\\b${word}\\b`).test(lowerText)) positiveScore += 1;
    });

    // Check strong negative (weight 3)
    strongNegative.forEach(phrase => {
      if (lowerText.includes(phrase)) negativeScore += 3;
    });

    // Check moderate negative (weight 2)
    moderateNegative.forEach(phrase => {
      if (lowerText.includes(phrase)) negativeScore += 2;
    });

    // Check minor negative (weight 1)
    minorNegative.forEach(word => {
      if (new RegExp(`\\b${word}\\b`).test(lowerText)) negativeScore += 1;
    });

    // Handle special cases and context
    positiveScore = this.adjustForContext(lowerText, positiveScore, 'positive');
    negativeScore = this.adjustForContext(lowerText, negativeScore, 'negative');

    // Determine sentiment based on weighted scores
    const scoreDifference = positiveScore - negativeScore;
    
    // Debug logging (remove in production)
    // console.log(`Text: "${text.substring(0, 50)}..." | Pos: ${positiveScore} | Neg: ${negativeScore} | Diff: ${scoreDifference}`);
    
    if (scoreDifference >= 1) return 'positive';
    if (scoreDifference <= -1) return 'negative';
    return 'neutral';
  }

  /**
   * Adjust sentiment scores based on context and modifiers
   */
  adjustForContext(text, score, type) {
    // Negation words that can flip sentiment
    const negationWords = ['not', 'no', 'never', 'without', 'lacks', 'fails to', 'unable to', 'unlikely'];
    
    // Uncertainty words that reduce confidence
    const uncertaintyWords = ['may', 'might', 'could', 'possible', 'potential', 'rumored', 'speculation'];
    
    // Check for negations that might flip sentiment
    let hasNegation = negationWords.some(negWord => {
      return text.includes(negWord);
    });

    // Check for uncertainty that reduces impact
    let hasUncertainty = uncertaintyWords.some(uncWord => {
      return text.includes(uncWord);
    });

    // Reduce score if uncertainty is present
    if (hasUncertainty) {
      score = Math.floor(score * 0.7);
    }

    // Handle negation context (this is simplified - full NLP would be better)
    if (hasNegation && type === 'positive') {
      score = Math.floor(score * 0.3); // Significantly reduce positive score
    } else if (hasNegation && type === 'negative') {
      score = Math.floor(score * 0.3); // Significantly reduce negative score
    }

    return score;
  }

  /**
   * Enrich a single trade with news data
   */
  async enrichTradeWithNews(tradeId, userId = null) {
    try {
      // Get trade details
      const tradeQuery = `
        SELECT symbol, trade_date, exit_time, exit_price, has_news
        FROM trades 
        WHERE id = $1
      `;
      const tradeResult = await db.query(tradeQuery, [tradeId]);
      
      if (tradeResult.rows.length === 0) {
        throw new Error('Trade not found');
      }

      const trade = tradeResult.rows[0];

      // Skip if trade already has news or is not completed
      if (trade.has_news || !trade.exit_time || !trade.exit_price) {
        return false;
      }

      // Get news data
      const newsData = await this.getNewsForSymbolAndDate(trade.symbol, trade.trade_date, userId);

      // Update trade with news data
      const updateQuery = `
        UPDATE trades 
        SET 
          has_news = $1,
          news_events = $2,
          news_sentiment = $3,
          news_checked_at = CURRENT_TIMESTAMP
        WHERE id = $4
      `;

      await db.query(updateQuery, [
        newsData.hasNews,
        JSON.stringify(newsData.newsEvents),
        newsData.sentiment,
        tradeId
      ]);

      logger.logImport(`Enriched trade ${tradeId} with news data (${newsData.newsEvents.length} articles, sentiment: ${newsData.sentiment || 'none'})`);
      return true;

    } catch (error) {
      logger.logError(`Error enriching trade ${tradeId} with news: ${error.message}`);
      return false;
    }
  }

  /**
   * Backfill news data for existing completed trades
   */
  async backfillTradeNews(options = {}) {
    const {
      userId = null,
      batchSize = 50,
      maxTrades = null,
      startDate = null,
      endDate = null
    } = options;

    if (this.isProcessing) {
      logger.logImport('News backfill already in progress');
      return;
    }

    this.isProcessing = true;
    logger.logImport('[START] Starting news backfill for existing trades');

    try {
      // Build query to find completed trades without news
      let whereClause = `
        WHERE exit_time IS NOT NULL 
        AND exit_price IS NOT NULL 
        AND (has_news = FALSE OR has_news IS NULL)
      `;
      const params = [];
      let paramCount = 1;

      if (userId) {
        whereClause += ` AND user_id = $${paramCount}`;
        params.push(userId);
        paramCount++;
      }

      if (startDate) {
        whereClause += ` AND trade_date >= $${paramCount}`;
        params.push(startDate);
        paramCount++;
      }

      if (endDate) {
        whereClause += ` AND trade_date <= $${paramCount}`;
        params.push(endDate);
        paramCount++;
      }

      // Get distinct symbol/date combinations to minimize API calls
      const symbolDateQuery = `
        SELECT DISTINCT symbol, trade_date, user_id
        FROM trades 
        ${whereClause}
        ORDER BY trade_date DESC, symbol
        ${maxTrades ? `LIMIT ${maxTrades}` : ''}
      `;

      const symbolDateResult = await db.query(symbolDateQuery, params);
      const uniqueSymbolDates = symbolDateResult.rows;

      logger.logImport(`Found ${uniqueSymbolDates.length} unique symbol/date combinations to process`);

      if (uniqueSymbolDates.length === 0) {
        logger.logImport('No trades need news enrichment');
        return;
      }

      // Process in batches to respect API limits
      let processed = 0;
      let enriched = 0;

      for (let i = 0; i < uniqueSymbolDates.length; i += batchSize) {
        const batch = uniqueSymbolDates.slice(i, i + batchSize);
        
        logger.logImport(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(uniqueSymbolDates.length / batchSize)} (${batch.length} items)`);

        for (const item of batch) {
          try {
            // Check if user is eligible for news enrichment
            if (!(await this.isNewsEnrichmentEnabled(item.user_id))) {
              continue;
            }

            // Get news data (will use cache if available)
            const newsData = await this.getNewsForSymbolAndDate(item.symbol, item.trade_date, item.user_id);

            // Update all trades for this symbol/date combination
            const updateQuery = `
              UPDATE trades 
              SET 
                has_news = $1,
                news_events = $2,
                news_sentiment = $3,
                news_checked_at = CURRENT_TIMESTAMP
              WHERE symbol = $4 
                AND trade_date = $5
                AND exit_time IS NOT NULL
                AND exit_price IS NOT NULL
                AND (has_news = FALSE OR has_news IS NULL)
            `;

            const updateResult = await db.query(updateQuery, [
              newsData.hasNews,
              JSON.stringify(newsData.newsEvents),
              newsData.sentiment,
              item.symbol,
              item.trade_date
            ]);

            const tradesUpdated = updateResult.rowCount;
            if (tradesUpdated > 0) {
              enriched += tradesUpdated;
              logger.logImport(`Updated ${tradesUpdated} trades for ${item.symbol} on ${item.trade_date} (${newsData.fromCache ? 'cached' : 'API'}, ${newsData.newsEvents.length} articles)`);
            }

            processed++;

            // Rate limiting: wait between API calls (not for cached results)
            if (!newsData.fromCache && i < uniqueSymbolDates.length - 1) {
              await new Promise(resolve => setTimeout(resolve, this.apiCallDelay));
            }

          } catch (error) {
            logger.logError(`Error processing ${item.symbol} on ${item.trade_date}: ${error.message}`);
          }
        }

        // Longer pause between batches
        if (i + batchSize < uniqueSymbolDates.length) {
          logger.logImport(`Batch complete. Waiting 5 seconds before next batch...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }

      logger.logImport(`News backfill complete: ${enriched} trades enriched from ${processed} symbol/date combinations`);

    } catch (error) {
      logger.logError(`Error during news backfill: ${error.message}`);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get news enrichment statistics
   */
  async getStats() {
    try {
      const statsQuery = `
        SELECT 
          COUNT(*) as total_completed_trades,
          COUNT(*) FILTER (WHERE has_news = TRUE) as trades_with_news,
          COUNT(DISTINCT symbol) as symbols_traded,
          COUNT(*) FILTER (WHERE news_checked_at IS NOT NULL) as trades_checked
        FROM trades 
        WHERE exit_time IS NOT NULL AND exit_price IS NOT NULL
      `;

      const cacheStatsQuery = `
        SELECT 
          COUNT(*) as cached_entries,
          COUNT(*) FILTER (WHERE jsonb_array_length(news_events) > 0) as entries_with_news,
          MIN(news_date) as earliest_date,
          MAX(news_date) as latest_date
        FROM news_cache
      `;

      const [statsResult, cacheResult] = await Promise.all([
        db.query(statsQuery),
        db.query(cacheStatsQuery)
      ]);

      return {
        trades: statsResult.rows[0],
        cache: cacheResult.rows[0],
        isProcessing: this.isProcessing
      };

    } catch (error) {
      logger.logError(`Error getting news stats: ${error.message}`);
      return null;
    }
  }
}

module.exports = new NewsEnrichmentService();