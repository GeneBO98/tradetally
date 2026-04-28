const db = require('../config/database');
const Trade = require('../models/Trade');
const AICreditService = require('./aiCreditService');
const AIProvider = require('../utils/aiProvider');
const TierService = require('./tierService');
const { validateAiProviderUrl } = require('../utils/urlSecurity');

/**
 * AI Session Service
 * Manages conversational AI sessions with context preservation
 * and follow-up question support.
 */
class AISessionService {
  // Session configuration
  static MAX_FOLLOWUPS = 5;
  static SESSION_EXPIRY_HOURS = 24;

  /**
   * Normalize filters to ensure arrays are properly formatted
   * Handles both comma-separated strings and arrays
   * @param {Object} filters - Raw filters from frontend
   * @returns {Object} Normalized filters
   */
  static normalizeFilters(filters = {}) {
    const normalized = { ...filters };

    // Fields that should be arrays
    const arrayFields = ['accounts', 'brokers', 'strategies', 'sectors', 'tags', 'daysOfWeek', 'instrumentTypes', 'optionTypes', 'qualityGrades'];

    arrayFields.forEach(field => {
      if (normalized[field]) {
        if (typeof normalized[field] === 'string') {
          // Convert comma-separated string to array
          normalized[field] = normalized[field].split(',').map(s => s.trim()).filter(Boolean);
        } else if (!Array.isArray(normalized[field])) {
          // Convert single value to array
          normalized[field] = [normalized[field]];
        }
      }
    });

    // Remove empty arrays and empty strings
    Object.keys(normalized).forEach(key => {
      const value = normalized[key];
      if (value === '' || value === null || value === undefined) {
        delete normalized[key];
      } else if (Array.isArray(value) && value.length === 0) {
        delete normalized[key];
      }
    });

    return normalized;
  }

  /**
   * Build a compressed trade summary for AI context
   * @param {string} userId - User ID
   * @param {Object} filters - Applied filters
   * @returns {Promise<Object>} Compressed trade summary
   */
  static async buildTradeSummary(userId, filters = {}) {
    console.log('[AI_SESSION] Building trade summary for user', userId);

    // Normalize filters to handle string vs array inconsistencies
    const normalizedFilters = this.normalizeFilters(filters);
    console.log('[AI_SESSION] Normalized filters:', normalizedFilters);

    // Get analytics for the filtered trades
    const analytics = await Trade.getAnalytics(userId, normalizedFilters);

    // Get recent trades for context
    const tradesResult = await Trade.findByUser(userId, {
      ...normalizedFilters,
      limit: 100,
      offset: 0
    });
    const trades = tradesResult.trades || tradesResult;

    // Extract key patterns
    const symbols = [...new Set(trades.map(t => t.symbol))].slice(0, 20);
    const strategies = [...new Set(trades.map(t => t.strategy).filter(Boolean))];
    const brokers = [...new Set(trades.map(t => t.broker).filter(Boolean))];

    // Calculate hourly P&L patterns
    const hourlyPnL = {};
    const hourlyCounts = {};
    trades.forEach(trade => {
      if (trade.entry_time) {
        const hour = new Date(trade.entry_time).getHours();
        hourlyPnL[hour] = (hourlyPnL[hour] || 0) + (parseFloat(trade.pnl) || 0);
        hourlyCounts[hour] = (hourlyCounts[hour] || 0) + 1;
      }
    });

    // Calculate daily P&L patterns
    const dailyPnL = {};
    const dailyCounts = {};
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    trades.forEach(trade => {
      if (trade.entry_time) {
        const day = days[new Date(trade.entry_time).getDay()];
        dailyPnL[day] = (dailyPnL[day] || 0) + (parseFloat(trade.pnl) || 0);
        dailyCounts[day] = (dailyCounts[day] || 0) + 1;
      }
    });

    // Sort trades by P&L for best/worst
    const sortedByPnL = [...trades]
      .filter(t => t.pnl !== null && t.pnl !== undefined)
      .sort((a, b) => parseFloat(b.pnl) - parseFloat(a.pnl));

    const bestTrades = sortedByPnL.slice(0, 3).map(t => ({
      symbol: t.symbol,
      side: t.side,
      pnl: parseFloat(t.pnl).toFixed(2),
      date: t.entry_time
    }));

    const worstTrades = sortedByPnL.slice(-3).reverse().map(t => ({
      symbol: t.symbol,
      side: t.side,
      pnl: parseFloat(t.pnl).toFixed(2),
      date: t.entry_time
    }));

    // Recent trades for sample context
    const recentTrades = trades.slice(0, 5).map(t => ({
      symbol: t.symbol,
      side: t.side,
      entry_price: parseFloat(t.entry_price).toFixed(2),
      exit_price: t.exit_price ? parseFloat(t.exit_price).toFixed(2) : 'OPEN',
      pnl: parseFloat(t.pnl || 0).toFixed(2),
      broker: t.broker
    }));

    // Format hourly data
    const hourlyData = Object.entries(hourlyPnL)
      .map(([hour, pnl]) => ({
        hour: parseInt(hour),
        pnl: parseFloat(pnl).toFixed(2),
        trades: hourlyCounts[hour]
      }))
      .sort((a, b) => b.pnl - a.pnl);

    // Format daily data
    const dailyData = Object.entries(dailyPnL)
      .map(([day, pnl]) => ({
        day,
        pnl: parseFloat(pnl).toFixed(2),
        trades: dailyCounts[day]
      }))
      .sort((a, b) => parseFloat(b.pnl) - parseFloat(a.pnl));

    return {
      // Core metrics from analytics
      metrics: {
        total_pnl: parseFloat(analytics.summary?.totalPnL || 0).toFixed(2),
        win_rate: parseFloat(analytics.summary?.winRate || 0).toFixed(2),
        profit_factor: parseFloat(analytics.summary?.profitFactor || 0).toFixed(2),
        avg_pnl: parseFloat(analytics.summary?.avgPnL || 0).toFixed(2),
        trade_count: parseInt(analytics.summary?.totalTrades || trades.length),
        best_trade: parseFloat(analytics.summary?.bestTrade || 0).toFixed(2),
        worst_trade: parseFloat(analytics.summary?.worstTrade || 0).toFixed(2)
      },

      // Patterns
      patterns: {
        symbols_traded: symbols,
        strategies_used: strategies,
        brokers_used: brokers
      },

      // Time analysis
      time_analysis: {
        hourly_pnl: hourlyData,
        daily_pnl: dailyData,
        best_hours: hourlyData.slice(0, 3),
        worst_hours: hourlyData.slice(-3).reverse()
      },

      // Sample trades
      sample_trades: {
        recent: recentTrades,
        best: bestTrades,
        worst: worstTrades
      },

      // Filter context
      filters_applied: filters,
      generated_at: new Date().toISOString()
    };
  }

  /**
   * Build the analysis prompt for AI
   * @param {Object} tradeSummary - Trade summary data
   * @param {Object} tradingProfile - User's trading profile
   * @returns {string} Formatted prompt
   */
  static buildAnalysisPrompt(tradeSummary, tradingProfile = null) {
    const metrics = tradeSummary.metrics;
    const patterns = tradeSummary.patterns;
    const timeAnalysis = tradeSummary.time_analysis;
    const sampleTrades = tradeSummary.sample_trades;

    let profileSection = '';
    if (tradingProfile) {
      profileSection = `
TRADER PROFILE:
- Trading Strategies: ${tradingProfile.tradingStrategies?.join(', ') || 'Not specified'}
- Trading Styles: ${tradingProfile.tradingStyles?.join(', ') || 'Not specified'}
- Risk Tolerance: ${tradingProfile.riskTolerance || 'moderate'}
- Experience Level: ${tradingProfile.experienceLevel || 'intermediate'}
- Average Position Size: ${tradingProfile.averagePositionSize || 'medium'}
- Primary Markets: ${tradingProfile.primaryMarkets?.join(', ') || 'Not specified'}
- Trading Goals: ${tradingProfile.tradingGoals?.join(', ') || 'Not specified'}

`;
    }

    const prompt = `You are a professional trading performance analyst. Analyze the following trading data and provide actionable recommendations.

${profileSection}TRADING PERFORMANCE METRICS:
- Total P&L: $${metrics.total_pnl}
- Win Rate: ${metrics.win_rate}%
- Total Trades: ${metrics.trade_count}
- Average Trade P&L: $${metrics.avg_pnl}
- Profit Factor: ${metrics.profit_factor}
- Best Trade: $${metrics.best_trade}
- Worst Trade: $${metrics.worst_trade}

TRADING PATTERNS:
- Symbols Traded: ${patterns.symbols_traded?.slice(0, 10).join(', ') || 'N/A'}
- Strategies Used: ${patterns.strategies_used?.join(', ') || 'N/A'}
- Brokers Used: ${patterns.brokers_used?.join(', ') || 'N/A'}

TIME-BASED ANALYSIS:
- Best Hours: ${timeAnalysis.best_hours?.map(h => `${h.hour}:00 ($${h.pnl})`).join(', ') || 'N/A'}
- Worst Hours: ${timeAnalysis.worst_hours?.map(h => `${h.hour}:00 ($${h.pnl})`).join(', ') || 'N/A'}
- Best Days: ${timeAnalysis.daily_pnl?.slice(0, 3).map(d => `${d.day} ($${d.pnl})`).join(', ') || 'N/A'}

RECENT TRADES:
${sampleTrades.recent?.map(t => `- ${t.symbol}: ${t.side} @ $${t.entry_price} -> ${t.exit_price}, P&L: $${t.pnl}`).join('\n') || 'No recent trades'}

BEST TRADES:
${sampleTrades.best?.map(t => `- ${t.symbol}: $${t.pnl} (${t.date})`).join('\n') || 'N/A'}

WORST TRADES:
${sampleTrades.worst?.map(t => `- ${t.symbol}: $${t.pnl} (${t.date})`).join('\n') || 'N/A'}

Please provide a comprehensive analysis with:
1. **STRENGTHS**: What the trader is doing well
2. **WEAKNESSES**: Areas needing improvement with specific examples
3. **RISK MANAGEMENT**: Assessment of risk management practices
4. **ENTRY/EXIT STRATEGY**: Analysis of timing and execution
5. **TIME PATTERNS**: Best and worst trading times/days
6. **PERSONALIZED ACTION PLAN**: 5-7 specific, actionable recommendations

Keep recommendations specific and data-driven. Use bullet points for clarity.`;

    return prompt;
  }

  static formatCurrencyValue(value) {
    if (value === null || value === undefined || value === '') return 'N/A';
    const number = Number(value);
    return Number.isFinite(number) ? `$${number.toFixed(2)}` : String(value);
  }

  static formatPercentValue(value) {
    if (value === null || value === undefined || value === '') return 'N/A';
    const number = Number(value);
    return Number.isFinite(number) ? `${number.toFixed(2)}%` : String(value);
  }

  static compactObject(value) {
    if (!value || typeof value !== 'object') return value;

    return Object.entries(value).reduce((acc, [key, item]) => {
      if (item !== null && item !== undefined && item !== '') {
        acc[key] = item;
      }
      return acc;
    }, {});
  }

  static async buildSingleTradeSummary(userId, tradeId) {
    if (!tradeId || typeof tradeId !== 'string') {
      throw new Error('Trade ID is required for single trade analysis');
    }

    const trade = await Trade.findById(tradeId, userId);
    if (!trade || trade.user_id !== userId) {
      throw new Error('Trade not found or access denied');
    }

    const executions = Array.isArray(trade.executions) ? trade.executions : [];
    const charts = [
      ...(trade.chart_url ? [{ chartUrl: trade.chart_url, chartTitle: 'Trade chart' }] : []),
      ...(Array.isArray(trade.charts) ? trade.charts : [])
    ].filter(chart => chart?.chartUrl || chart?.chart_url);

    const attachments = (Array.isArray(trade.attachments) ? trade.attachments : [])
      .filter(attachment => attachment?.file_url)
      .map(attachment => this.compactObject({
        file_name: attachment.file_name,
        file_type: attachment.file_type,
        file_url: attachment.file_url,
        uploaded_at: attachment.uploaded_at
      }));

    const newsEvents = Array.isArray(trade.news_events) ? trade.news_events : [];

    return {
      analysis_type: 'single_trade',
      trade_id: trade.id,
      trade: this.compactObject({
        symbol: trade.symbol,
        company_name: trade.company_name,
        sector: trade.sector,
        side: trade.side,
        status: trade.exit_time ? 'closed' : 'open',
        instrument_type: trade.instrument_type,
        option_type: trade.option_type,
        underlying_symbol: trade.underlying_symbol,
        strike_price: trade.strike_price,
        expiration_date: trade.expiration_date,
        contract_size: trade.contract_size,
        point_value: trade.point_value,
        quantity: trade.quantity,
        entry_price: trade.entry_price,
        exit_price: trade.exit_price,
        entry_time: trade.entry_time,
        exit_time: trade.exit_time,
        trade_date: trade.trade_date,
        pnl: trade.pnl,
        pnl_percent: trade.pnl_percent,
        commission: trade.commission,
        fees: trade.fees,
        stop_loss: trade.stop_loss,
        take_profit: trade.take_profit,
        take_profit_targets: trade.take_profit_targets,
        r_value: trade.r_value,
        mae: trade.mae,
        mfe: trade.mfe,
        confidence: trade.confidence,
        strategy: trade.strategy,
        setup: trade.setup,
        tags: trade.tags,
        notes: trade.notes,
        broker: trade.broker,
        account_identifier: trade.account_identifier,
        quality_grade: trade.quality_grade,
        quality_score: trade.quality_score,
        quality_metrics: trade.quality_metrics,
        playbook_id: trade.playbook_id
      }),
      executions: executions.map(execution => this.compactObject({
        action: execution.action || execution.side,
        quantity: execution.quantity,
        price: execution.price,
        datetime: execution.datetime,
        entry_price: execution.entryPrice || execution.entry_price,
        exit_price: execution.exitPrice || execution.exit_price,
        entry_time: execution.entryTime || execution.entry_time,
        exit_time: execution.exitTime || execution.exit_time,
        pnl: execution.pnl,
        commission: execution.commission,
        fees: execution.fees
      })),
      enrichment: {
        sector: trade.sector || null,
        company_name: trade.company_name || null,
        has_news: trade.has_news === true,
        news_sentiment: trade.news_sentiment || null,
        news_checked_at: trade.news_checked_at || null,
        news_events: newsEvents.slice(0, 8).map(article => this.compactObject({
          headline: article.headline,
          summary: article.summary,
          source: article.source,
          datetime: article.datetime,
          sentiment: article.sentiment,
          url: article.url
        }))
      },
      visual_context: {
        charts: charts.map(chart => this.compactObject({
          title: chart.chartTitle || chart.chart_title,
          url: chart.chartUrl || chart.chart_url,
          uploaded_at: chart.uploadedAt || chart.uploaded_at
        })),
        images: attachments
      },
      generated_at: new Date().toISOString()
    };
  }

  static buildSingleTradePrompt(tradeSummary, tradingProfile = null) {
    const trade = tradeSummary.trade;
    const enrichment = tradeSummary.enrichment;
    const visualContext = tradeSummary.visual_context;

    let profileSection = '';
    if (tradingProfile) {
      profileSection = `
TRADER PROFILE:
- Strategies: ${tradingProfile.tradingStrategies?.join(', ') || 'Not specified'}
- Styles: ${tradingProfile.tradingStyles?.join(', ') || 'Not specified'}
- Risk Tolerance: ${tradingProfile.riskTolerance || 'moderate'}
- Experience Level: ${tradingProfile.experienceLevel || 'intermediate'}
- Primary Markets: ${tradingProfile.primaryMarkets?.join(', ') || 'Not specified'}

`;
    }

    const executions = tradeSummary.executions?.length
      ? tradeSummary.executions.map((execution, index) => `- #${index + 1}: ${JSON.stringify(execution)}`).join('\n')
      : 'No execution-level fills available.';

    const news = enrichment.news_events?.length
      ? enrichment.news_events.map(article => `- ${article.headline || 'Untitled'} (${article.source || 'Unknown'}, ${article.datetime || 'unknown time'}, sentiment: ${article.sentiment || 'N/A'}): ${article.summary || 'No summary'}${article.url ? ` URL: ${article.url}` : ''}`).join('\n')
      : 'No linked news events available.';

    const charts = visualContext.charts?.length
      ? visualContext.charts.map((chart, index) => `- Chart ${index + 1}${chart.title ? ` (${chart.title})` : ''}: ${chart.url}`).join('\n')
      : 'No attached chart URLs available.';

    const images = visualContext.images?.length
      ? visualContext.images.map((image, index) => `- Image ${index + 1}: ${image.file_name || 'unnamed'} (${image.file_type || 'unknown type'}) at ${image.file_url}`).join('\n')
      : 'No attached trade images available.';

    return `You are a professional trading coach and technical analyst. Analyze one specific trade to determine what went wrong, what worked, and what the trader should change next time. Base the analysis only on the available trade data, executions, enrichment, news, sector/company context, notes, chart links, and image attachment references below. If chart or image URLs are not directly viewable by your model, explicitly say you are using them as attachment references rather than visually inspecting them.

${profileSection}TRADE SNAPSHOT:
- Symbol: ${trade.symbol}${trade.company_name ? ` (${trade.company_name})` : ''}
- Sector: ${trade.sector || 'N/A'}
- Side: ${trade.side || 'N/A'}
- Status: ${trade.status || 'N/A'}
- Instrument: ${trade.instrument_type || 'stock'}${trade.option_type ? ` ${trade.option_type}` : ''}
- Quantity: ${trade.quantity || 'N/A'}
- Entry: ${this.formatCurrencyValue(trade.entry_price)} at ${trade.entry_time || 'N/A'}
- Exit: ${trade.exit_price ? this.formatCurrencyValue(trade.exit_price) : 'Open'} at ${trade.exit_time || 'N/A'}
- P&L: ${this.formatCurrencyValue(trade.pnl)} (${this.formatPercentValue(trade.pnl_percent)})
- R-Multiple: ${trade.r_value ?? 'N/A'}
- MAE/MFE: ${this.formatCurrencyValue(trade.mae)} / ${this.formatCurrencyValue(trade.mfe)}
- Stop Loss: ${this.formatCurrencyValue(trade.stop_loss)}
- Take Profit: ${this.formatCurrencyValue(trade.take_profit)}
- Strategy: ${trade.strategy || 'N/A'}
- Setup: ${trade.setup || 'N/A'}
- Confidence: ${trade.confidence || 'N/A'}
- Setup Quality: ${trade.quality_grade || 'N/A'}${trade.quality_score ? ` (${trade.quality_score}/5)` : ''}
- Tags: ${Array.isArray(trade.tags) ? trade.tags.join(', ') : (trade.tags || 'N/A')}
- Notes: ${trade.notes || 'No notes'}

EXECUTIONS:
${executions}

ENRICHMENT:
- News sentiment: ${enrichment.news_sentiment || 'N/A'}
- News checked at: ${enrichment.news_checked_at || 'N/A'}
- Sector/company context: ${enrichment.sector || 'N/A'} / ${enrichment.company_name || 'N/A'}

NEWS:
${news}

VISUAL CONTEXT:
Charts:
${charts}

Images:
${images}

QUALITY METRICS:
${JSON.stringify(trade.quality_metrics || {}, null, 2)}

Please structure the response with:
1. **Verdict**: A concise diagnosis of the most likely reason this trade underperformed or the biggest risk if it is still open.
2. **Technical Analysis**: Entry location, trend/context, stop/target placement, risk-reward, timing, MAE/MFE, and execution quality.
3. **News & Sector Context**: How the linked news sentiment/events and sector/company data may have affected the setup.
4. **Process Mistakes**: Specific rule, psychology, sizing, timing, or plan-adherence issues visible in the data.
5. **What To Do Next Time**: 3-5 concrete improvements tied to this exact trade.

Be direct, data-driven, and specific. Do not give generic trading advice.`;
  }

  /**
   * Create a new AI session with initial analysis
   * @param {string} userId - User ID
   * @param {Object} filters - Filters to apply
   * @param {Object} options - Additional options (apiKey, modelName)
   * @returns {Promise<Object>} Session with initial analysis
   */
  static async createSession(userId, filters = {}, options = {}) {
    console.log('[AI_SESSION] Creating new session for user', userId);

    // Normalize filters first
    const normalizedFilters = this.normalizeFilters(filters);
    const isSingleTradeAnalysis = options.analysisType === 'single_trade' || !!options.tradeId;

    if (isSingleTradeAnalysis && !options.tradeId) {
      throw new Error('Trade ID is required for single trade analysis');
    }

    // Check credits
    const creditCheck = await AICreditService.hasCredits(userId, AICreditService.getCost('NEW_SESSION'));
    if (!creditCheck.allowed) {
      throw new Error(creditCheck.message || 'Insufficient credits to start AI session');
    }

    // Build trade summary (uses normalized filters internally)
    const tradeSummary = isSingleTradeAnalysis
      ? await this.buildSingleTradeSummary(userId, options.tradeId)
      : await this.buildTradeSummary(userId, normalizedFilters);

    // Get user trading profile if available
    let tradingProfile = null;
    try {
      const profileResult = await db.query(
        `SELECT trading_strategies, trading_styles, risk_tolerance, experience_level,
                average_position_size, primary_markets, trading_goals, preferred_sectors
         FROM users WHERE id = $1`,
        [userId]
      );
      if (profileResult.rows[0]) {
        const row = profileResult.rows[0];
        tradingProfile = {
          tradingStrategies: row.trading_strategies || [],
          tradingStyles: row.trading_styles || [],
          riskTolerance: row.risk_tolerance || 'moderate',
          experienceLevel: row.experience_level || 'intermediate',
          averagePositionSize: row.average_position_size || 'medium',
          primaryMarkets: row.primary_markets || [],
          tradingGoals: row.trading_goals || [],
          preferredSectors: row.preferred_sectors || []
        };
      }
    } catch (error) {
      console.warn('[AI_SESSION] Could not load trading profile:', error.message);
    }

    // Get AI provider settings
    const aiSettings = await this.getAISettings(userId, options);
    tradeSummary.ai_metadata = {
      provider: aiSettings.provider || null,
      model: aiSettings.modelName || null
    };

    // Build the analysis prompt
    const prompt = isSingleTradeAnalysis
      ? this.buildSingleTradePrompt(tradeSummary, tradingProfile)
      : this.buildAnalysisPrompt(tradeSummary, tradingProfile);

    // Generate initial analysis
    console.log('[AI_SESSION] Generating initial analysis...');
    const initialAnalysis = await AIProvider.generateResponse(prompt, aiSettings);

    // Create session record
    const sessionResult = await db.query(
      `INSERT INTO ai_sessions
       (user_id, filters_applied, trade_count, trade_summary, max_followups, status, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'active', CURRENT_TIMESTAMP + INTERVAL '${this.SESSION_EXPIRY_HOURS} hours')
       RETURNING id, filters_applied, trade_count, followup_count, max_followups, status, expires_at, created_at`,
      [
        userId,
        JSON.stringify(isSingleTradeAnalysis ? { tradeId: options.tradeId, analysisType: 'single_trade' } : normalizedFilters),
        isSingleTradeAnalysis ? 1 : tradeSummary.metrics.trade_count,
        JSON.stringify(tradeSummary),
        this.MAX_FOLLOWUPS
      ]
    );

    const session = sessionResult.rows[0];

    // Store initial messages (system context + assistant response)
    await db.query(
      `INSERT INTO ai_messages (session_id, role, content, credits_used)
       VALUES ($1, 'system', $2, 0)`,
      [session.id, `Trade analysis session started. Context: ${JSON.stringify(isSingleTradeAnalysis ? { analysis_type: 'single_trade', trade_id: tradeSummary.trade_id, symbol: tradeSummary.trade?.symbol } : tradeSummary.metrics)}`]
    );

    await db.query(
      `INSERT INTO ai_messages (session_id, role, content, credits_used)
       VALUES ($1, 'assistant', $2, $3)`,
      [session.id, initialAnalysis, AICreditService.getCost('NEW_SESSION')]
    );

    // Deduct credits
    const creditsResult = await AICreditService.useCredits(userId, AICreditService.getCost('NEW_SESSION'));

    console.log('[AI_SESSION] Session created:', session.id);

    return {
      session_id: session.id,
      initial_analysis: initialAnalysis,
      trade_summary: isSingleTradeAnalysis ? {
        analysis_type: 'single_trade',
        trade_id: tradeSummary.trade_id,
        symbol: tradeSummary.trade?.symbol,
        pnl: tradeSummary.trade?.pnl,
        ai_metadata: tradeSummary.ai_metadata
      } : tradeSummary.metrics,
      ai_metadata: tradeSummary.ai_metadata,
      followup_count: 0,
      max_followups: session.max_followups,
      credits_used: AICreditService.getCost('NEW_SESSION'),
      credits_remaining: creditsResult.remaining,
      expires_at: session.expires_at
    };
  }

  /**
   * Send a follow-up question in an existing session
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID (for verification)
   * @param {string} message - User's follow-up question
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} AI response with updated session state
   */
  static async sendFollowup(sessionId, userId, message, options = {}) {
    console.log('[AI_SESSION] Processing follow-up for session', sessionId);

    // Verify session ownership and status
    const sessionResult = await db.query(
      `SELECT s.*,
              (SELECT json_agg(m ORDER BY m.created_at)
               FROM ai_messages m WHERE m.session_id = s.id) as messages
       FROM ai_sessions s
       WHERE s.id = $1 AND s.user_id = $2`,
      [sessionId, userId]
    );

    if (sessionResult.rows.length === 0) {
      throw new Error('Session not found or access denied');
    }

    const session = sessionResult.rows[0];

    // Check session status
    if (session.status !== 'active') {
      throw new Error(`Session is ${session.status}. Please start a new session.`);
    }

    // Check expiration
    if (new Date(session.expires_at) < new Date()) {
      await this.closeSession(sessionId, 'expired');
      throw new Error('Session has expired. Please start a new session.');
    }

    // Check follow-up limit
    if (session.followup_count >= session.max_followups) {
      throw new Error(`Maximum follow-up questions (${session.max_followups}) reached. Please start a new session.`);
    }

    // Check credits
    const creditCheck = await AICreditService.hasCredits(userId, AICreditService.getCost('FOLLOWUP'));
    if (!creditCheck.allowed) {
      throw new Error(creditCheck.message || 'Insufficient credits for follow-up question');
    }

    // Get AI provider settings
    const aiSettings = await this.getAISettings(userId, options);

    // Build conversation history for context
    const messages = session.messages || [];
    const conversationHistory = messages
      .filter(m => m.role !== 'system')
      .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');

    // Build prompt with context
    const tradeSummary = session.trade_summary;
    const isSingleTrade = tradeSummary?.analysis_type === 'single_trade';
    const contextPrompt = isSingleTrade
      ? `You are an AI trading coach continuing a conversation about one specific trade.

SINGLE TRADE CONTEXT:
- Symbol: ${tradeSummary.trade?.symbol || 'N/A'}
- Side: ${tradeSummary.trade?.side || 'N/A'}
- Entry: ${tradeSummary.trade?.entry_price || 'N/A'} at ${tradeSummary.trade?.entry_time || 'N/A'}
- Exit: ${tradeSummary.trade?.exit_price || 'Open'} at ${tradeSummary.trade?.exit_time || 'N/A'}
- P&L: ${tradeSummary.trade?.pnl || 'N/A'}
- R-Multiple: ${tradeSummary.trade?.r_value ?? 'N/A'}
- Strategy/Setup: ${tradeSummary.trade?.strategy || 'N/A'} / ${tradeSummary.trade?.setup || 'N/A'}
- News sentiment: ${tradeSummary.enrichment?.news_sentiment || 'N/A'}
- Charts attached: ${tradeSummary.visual_context?.charts?.length || 0}
- Images attached: ${tradeSummary.visual_context?.images?.length || 0}

CONVERSATION HISTORY:
${conversationHistory}

USER'S FOLLOW-UP QUESTION:
${message}

Please answer using the single-trade context and previous analysis. Keep it specific to this trade.`
      : `You are an AI trading performance analyst continuing a conversation about a trader's performance.

TRADING CONTEXT:
- Total P&L: $${tradeSummary.metrics.total_pnl}
- Win Rate: ${tradeSummary.metrics.win_rate}%
- Total Trades: ${tradeSummary.metrics.trade_count}
- Profit Factor: ${tradeSummary.metrics.profit_factor}

CONVERSATION HISTORY:
${conversationHistory}

USER'S FOLLOW-UP QUESTION:
${message}

Please provide a helpful, specific response to the user's question. Reference the trading data when relevant. Keep responses concise but informative. Use bullet points for clarity.`;

    // Generate response
    console.log('[AI_SESSION] Generating follow-up response...');
    const response = await AIProvider.generateResponse(contextPrompt, aiSettings);

    // Store user message
    await db.query(
      `INSERT INTO ai_messages (session_id, role, content, credits_used)
       VALUES ($1, 'user', $2, 0)`,
      [sessionId, message]
    );

    // Store assistant response
    await db.query(
      `INSERT INTO ai_messages (session_id, role, content, credits_used)
       VALUES ($1, 'assistant', $2, $3)`,
      [sessionId, response, AICreditService.getCost('FOLLOWUP')]
    );

    // Update session follow-up count and expiration
    await db.query(
      `UPDATE ai_sessions
       SET followup_count = followup_count + 1,
           expires_at = CURRENT_TIMESTAMP + INTERVAL '${this.SESSION_EXPIRY_HOURS} hours',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [sessionId]
    );

    // Deduct credits
    const creditsResult = await AICreditService.useCredits(userId, AICreditService.getCost('FOLLOWUP'));

    const newFollowupCount = session.followup_count + 1;
    console.log('[AI_SESSION] Follow-up processed. Count:', newFollowupCount);

    return {
      response,
      followup_count: newFollowupCount,
      max_followups: session.max_followups,
      followups_remaining: session.max_followups - newFollowupCount,
      credits_used: AICreditService.getCost('FOLLOWUP'),
      credits_remaining: creditsResult.remaining
    };
  }

  /**
   * Get session details with message history
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID (for verification)
   * @returns {Promise<Object>} Session with messages
   */
  static async getSession(sessionId, userId) {
    const result = await db.query(
      `SELECT s.id, s.filters_applied, s.trade_count, s.trade_summary,
              s.followup_count, s.max_followups, s.status, s.expires_at, s.created_at,
              (SELECT json_agg(json_build_object(
                'id', m.id,
                'role', m.role,
                'content', m.content,
                'created_at', m.created_at
              ) ORDER BY m.created_at)
               FROM ai_messages m WHERE m.session_id = s.id AND m.role != 'system') as messages
       FROM ai_sessions s
       WHERE s.id = $1 AND s.user_id = $2`,
      [sessionId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Session not found or access denied');
    }

    const session = result.rows[0];

    const storedSummary = session.trade_summary || {};

    return {
      id: session.id,
      status: session.status,
      filters_applied: session.filters_applied,
      trade_count: session.trade_count,
      trade_summary: storedSummary.analysis_type === 'single_trade'
        ? {
            analysis_type: 'single_trade',
            trade_id: storedSummary.trade_id,
            symbol: storedSummary.trade?.symbol,
            pnl: storedSummary.trade?.pnl,
            ai_metadata: storedSummary.ai_metadata || null
          }
        : storedSummary.metrics || {},
      ai_metadata: storedSummary.ai_metadata || null,
      followup_count: session.followup_count,
      max_followups: session.max_followups,
      followups_remaining: session.max_followups - session.followup_count,
      expires_at: session.expires_at,
      created_at: session.created_at,
      messages: session.messages || []
    };
  }

  /**
   * Get user's recent sessions
   * @param {string} userId - User ID
   * @param {number} limit - Number of sessions to return
   * @returns {Promise<Array>} Recent sessions
   */
  static async getUserSessions(userId, limit = 10) {
    const result = await db.query(
      `SELECT id, filters_applied, trade_count, followup_count, max_followups,
              status, expires_at, created_at
       FROM ai_sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map(row => ({
      id: row.id,
      status: row.status,
      trade_count: row.trade_count,
      followup_count: row.followup_count,
      max_followups: row.max_followups,
      created_at: row.created_at
    }));
  }

  static async getTradeAnalyses(userId, tradeId, limit = 10) {
    if (!tradeId || typeof tradeId !== 'string') {
      throw new Error('Trade ID is required');
    }

    const trade = await Trade.findById(tradeId, userId);
    if (!trade || trade.user_id !== userId) {
      throw new Error('Trade not found or access denied');
    }

    const result = await db.query(
      `SELECT
          s.id,
          s.status,
          s.trade_summary,
          s.followup_count,
          s.max_followups,
          s.created_at,
          s.updated_at,
          COALESCE(
            json_agg(
              json_build_object(
                'id', m.id,
                'content', m.content,
                'credits_used', m.credits_used,
                'created_at', m.created_at
              )
              ORDER BY m.created_at
            ) FILTER (WHERE m.id IS NOT NULL),
            '[]'::json
          ) as responses
       FROM ai_sessions s
       LEFT JOIN ai_messages m
         ON m.session_id = s.id
        AND m.role = 'assistant'
       WHERE s.user_id = $1
         AND s.filters_applied->>'analysisType' = 'single_trade'
         AND s.filters_applied->>'tradeId' = $2
       GROUP BY s.id
       ORDER BY s.created_at DESC
       LIMIT $3`,
      [userId, tradeId, Math.min(parseInt(limit, 10) || 10, 25)]
    );

    return result.rows.map(row => ({
      id: row.id,
      status: row.status,
      trade_id: row.trade_summary?.trade_id || tradeId,
      symbol: row.trade_summary?.trade?.symbol || trade.symbol,
      ai_metadata: row.trade_summary?.ai_metadata || null,
      response_count: Array.isArray(row.responses) ? row.responses.length : 0,
      followup_count: row.followup_count,
      max_followups: row.max_followups,
      created_at: row.created_at,
      updated_at: row.updated_at,
      responses: row.responses || []
    }));
  }

  /**
   * Close a session
   * @param {string} sessionId - Session ID
   * @param {string} status - New status ('closed' or 'expired')
   * @returns {Promise<boolean>}
   */
  static async closeSession(sessionId, status = 'closed') {
    await db.query(
      `UPDATE ai_sessions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [status, sessionId]
    );
    console.log(`[AI_SESSION] Session ${sessionId} marked as ${status}`);
    return true;
  }

  /**
   * Cleanup expired sessions (cron job)
   * @returns {Promise<number>} Number of sessions cleaned up
   */
  static async cleanupExpiredSessions() {
    const result = await db.query(
      `UPDATE ai_sessions
       SET status = 'expired', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'active' AND expires_at < CURRENT_TIMESTAMP
       RETURNING id`
    );

    const count = result.rows.length;
    if (count > 0) {
      console.log(`[AI_SESSION] Cleaned up ${count} expired sessions`);
    }
    return count;
  }

  /**
   * Get AI provider settings for a user
   * @param {string} userId - User ID
   * @param {Object} options - Override options
   * @returns {Promise<Object>} { apiKey, modelName, provider, apiUrl }
   */
  static async getAISettings(userId, options = {}) {
    let apiKey = options.apiKey;
    let modelName = options.modelName;
    let provider = options.provider;
    let apiUrl = options.apiUrl;

    try {
      // Route through User.getSettings so the encrypted ai_api_key is
      // transparently decrypted via the model layer.
      const User = require('../models/User');
      const settings = await User.getSettings(userId);

      if (settings) {
        provider = provider || settings.ai_provider || 'gemini';
        apiKey = apiKey || settings.ai_api_key;
        apiUrl = apiUrl || settings.ai_api_url;
        modelName = modelName || settings.ai_model;
      }
    } catch (error) {
      console.warn('[AI_SESSION] Could not load AI settings from database:', error.message);
    }

    // Require provider to be configured
    if (!provider) {
      throw new Error('No AI provider configured. Please configure your AI provider in Settings > AI Provider.');
    }

    // For local providers (LM Studio, Ollama), API key is optional
    const localProviders = ['lmstudio', 'ollama', 'local'];
    const isLocalProvider = localProviders.includes(provider);

    if (!isLocalProvider && !apiKey) {
      throw new Error(`No API key configured for ${provider}. Please configure it in Settings > AI Provider.`);
    }

    // Set default API URLs for local providers
    if (isLocalProvider && !apiUrl) {
      if (provider === 'lmstudio') apiUrl = 'http://localhost:1234/v1';
      else if (provider === 'ollama') apiUrl = 'http://localhost:11434/v1';
      else apiUrl = 'http://localhost:1234/v1'; // generic local
    }

    if (apiUrl) {
      apiUrl = (await validateAiProviderUrl(provider, apiUrl)).toString();
    }

    // Set default model names if not specified
    if (!modelName) {
      if (provider === 'lmstudio' || provider === 'ollama' || provider === 'local') modelName = 'local-model';
    }

    console.log(`[AI_SESSION] Using provider: ${provider}, model: ${modelName}, url: ${apiUrl || 'default'}`);

    return { apiKey, modelName, provider, apiUrl };
  }
}

module.exports = AISessionService;
