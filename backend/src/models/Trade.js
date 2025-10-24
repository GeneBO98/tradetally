const db = require('../config/database');
const AchievementService = require('../services/achievementService');
const { getUserLocalDate } = require('../utils/timezone');

class Trade {
  /**
   * Ensure tags exist in the tags table
   * Creates tags if they don't exist
   */
  static async ensureTagsExist(userId, tags) {
    if (!tags || tags.length === 0) return;

    for (const tagName of tags) {
      if (!tagName || tagName.trim() === '') continue;

      try {
        // Check if tag exists
        const checkResult = await db.query(
          'SELECT id FROM tags WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
          [userId, tagName.trim()]
        );

        // Create tag if it doesn't exist
        if (checkResult.rows.length === 0) {
          await db.query(
            'INSERT INTO tags (user_id, name, color) VALUES ($1, $2, $3) ON CONFLICT (user_id, name) DO NOTHING',
            [userId, tagName.trim(), '#3B82F6'] // Default blue color
          );
          console.log(`[TAGS] Auto-created tag "${tagName}" for user ${userId}`);
        }
      } catch (error) {
        console.warn(`[TAGS] Failed to ensure tag "${tagName}" exists:`, error.message);
      }
    }
  }

  static async create(userId, tradeData, options = {}) {
    const {
      symbol, entryTime, exitTime, entryPrice, exitPrice,
      quantity, side, commission, entryCommission, exitCommission, fees, notes, isPublic, broker,
      strategy, setup, tags, pnl: providedPnL, pnlPercent: providedPnLPercent,
      executionData, mae, mfe, confidence, tradeDate,
      instrumentType = 'stock', strikePrice, expirationDate, optionType,
      contractSize, underlyingSymbol, contractMonth, contractYear,
      tickSize, pointValue, underlyingAsset, importId,
      originalCurrency, exchangeRate, originalEntryPriceCurrency,
      originalExitPriceCurrency, originalPnlCurrency, originalCommissionCurrency,
      originalFeesCurrency,
      stopLoss, takeProfit
    } = tradeData;

    // Convert empty strings to null for optional fields
    const cleanExitTime = exitTime === '' ? null : exitTime;
    const cleanExitPrice = exitPrice === '' ? null : exitPrice;

    // Handle case where entryTime is null but tradeDate is provided (e.g., from imports)
    // Use tradeDate with a default time of 09:30 (market open)
    const finalEntryTime = entryTime || (tradeDate ? `${tradeDate}T09:30:00` : null);
    if (!finalEntryTime) {
      throw new Error('Entry time is required for creating a trade');
    }

    // Use provided P&L if available (e.g., from Schwab), otherwise calculate it
    const pnl = providedPnL !== undefined ? providedPnL : this.calculatePnL(entryPrice, cleanExitPrice, quantity, side, commission, fees, instrumentType, contractSize, pointValue);
    const pnlPercent = providedPnLPercent !== undefined ? providedPnLPercent : this.calculatePnLPercent(entryPrice, cleanExitPrice, side, pnl, quantity, instrumentType, pointValue);

    // Calculate R-Multiple if stop loss and exit price are provided
    // R-Multiple measures actual performance vs initial risk, so we need the actual exit price
    const rValue = (stopLoss && cleanExitPrice && entryPrice && side)
      ? this.calculateRValue(entryPrice, stopLoss, cleanExitPrice, side)
      : null;

    // Use exit date as trade date if available, otherwise use entry date
    // If tradeDate is explicitly provided (e.g., from imports), use it directly
    // Otherwise, extract the date portion from the timestamp WITHOUT timezone conversion
    // This preserves the date the user entered in the form
    let finalTradeDate = tradeDate;
    if (!finalTradeDate) {
      // Extract date from timestamp (YYYY-MM-DD format)
      const timestampToUse = cleanExitTime || finalEntryTime;
      finalTradeDate = timestampToUse.split('T')[0];
    }

    // Auto-assign strategy if not provided by user
    let finalStrategy = strategy;
    let strategyConfidence = null;
    let classificationMethod = null;
    let classificationMetadata = null;
    let manualOverride = false;
    let shouldQueueClassification = false;

    if (!strategy || strategy.trim() === '') {
      // Check if we should skip API calls (e.g., during import)
      if (options.skipApiCalls) {
        // Use basic time-based classification and queue full classification for later
        const tempTrade = {
          symbol: symbol.toUpperCase(),
          entry_time: finalEntryTime,
          exit_time: cleanExitTime,
          entry_price: entryPrice,
          exit_price: cleanExitPrice,
          quantity,
          side,
          pnl,
          hold_time_minutes: cleanExitTime ? 
            (new Date(cleanExitTime) - new Date(finalEntryTime)) / (1000 * 60) : null
        };

        const basicClassification = await this.classifyTradeBasic(tempTrade);
        finalStrategy = basicClassification.strategy || 'day_trading';
        strategyConfidence = basicClassification.confidence ? Math.round(basicClassification.confidence * 100) : 60;
        classificationMethod = 'basic_import';
        classificationMetadata = {
          holdTimeMinutes: tempTrade.hold_time_minutes,
          analysisTimestamp: new Date().toISOString(),
          needsFullClassification: true
        };
        
        // Mark for background processing if complete trade
        if (cleanExitTime && cleanExitPrice) {
          shouldQueueClassification = true;
        }
      } else {
        // Normal classification with API calls
        const tempTrade = {
          symbol: symbol.toUpperCase(),
          entry_time: finalEntryTime,
          exit_time: cleanExitTime,
          entry_price: entryPrice,
          exit_price: cleanExitPrice,
          quantity,
          side,
          pnl,
          hold_time_minutes: cleanExitTime ? 
            (new Date(cleanExitTime) - new Date(finalEntryTime)) / (1000 * 60) : null
        };

        try {
          // Use enhanced classification if trade is complete, otherwise basic classification
          const classification = cleanExitTime && cleanExitPrice ? 
            await this.classifyTradeStrategyWithAnalysis(tempTrade, userId) :
            await this.classifyTradeBasic(tempTrade);
          
          if (typeof classification === 'object') {
            finalStrategy = classification.strategy;
            strategyConfidence = Math.round((classification.confidence || 0.5) * 100);
            classificationMethod = classification.method || (cleanExitTime ? 'technical_analysis' : 'time_based_partial');
            classificationMetadata = {
              signals: classification.signals || [],
              holdTimeMinutes: classification.holdTimeMinutes,
              priceMove: classification.priceMove,
              analysisTimestamp: new Date().toISOString()
            };
          } else {
            finalStrategy = classification;
            strategyConfidence = 70; // Default confidence for basic classification
            classificationMethod = 'time_based';
            classificationMetadata = {
              holdTimeMinutes: tempTrade.hold_time_minutes,
              analysisTimestamp: new Date().toISOString()
            };
          }
        } catch (error) {
          console.warn('Error in automatic strategy classification:', error.message);
          finalStrategy = 'day_trading'; // Default fallback
          strategyConfidence = 50;
          classificationMethod = 'fallback';
          classificationMetadata = { error: error.message };
        }
      }
    } else {
      // User provided strategy - mark as manual override
      manualOverride = true;
      strategyConfidence = 100;
      classificationMethod = 'manual';
      classificationMetadata = { userProvided: true };
    }

    // Check for news events (Pro feature)
    let newsData = {
      hasNews: false,
      newsEvents: [],
      sentiment: null,
      checkedAt: null
    };

    // Only check news for complete trades and if not skipping API calls
    if (!options.skipApiCalls && cleanExitTime && cleanExitPrice) {
      try {
        newsData = await this.checkNewsForTrade({
          symbol: symbol.toUpperCase(),
          tradeDate: finalTradeDate,
          entry_time: finalEntryTime
        }, userId);
      } catch (error) {
        console.warn(`Error checking news for trade: ${error.message}`);
      }
    }

    // Ensure tags exist in tags table
    if (tags && tags.length > 0) {
      await this.ensureTagsExist(userId, tags);
    }

    const query = `
      INSERT INTO trades (
        user_id, symbol, trade_date, entry_time, exit_time, entry_price, exit_price,
        quantity, side, commission, entry_commission, exit_commission, fees, pnl, pnl_percent, notes, is_public,
        broker, strategy, setup, tags, executions, mae, mfe, confidence,
        strategy_confidence, classification_method, classification_metadata, manual_override,
        news_events, has_news, news_sentiment, news_checked_at,
        instrument_type, strike_price, expiration_date, option_type, contract_size, underlying_symbol,
        contract_month, contract_year, tick_size, point_value, underlying_asset, import_id,
        original_currency, exchange_rate, original_entry_price_currency, original_exit_price_currency,
        original_pnl_currency, original_commission_currency, original_fees_currency,
        stop_loss, take_profit, r_value
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55)
      RETURNING *
    `;

    const values = [
      userId, symbol.toUpperCase(), finalTradeDate, finalEntryTime, cleanExitTime, entryPrice, cleanExitPrice,
      quantity, side, commission || 0, entryCommission || 0, exitCommission || 0, fees || 0, pnl, pnlPercent, notes, isPublic || false,
      broker, finalStrategy, setup, tags || [], JSON.stringify(executionData || []), mae || null, mfe || null, confidence || 5,
      strategyConfidence, classificationMethod, JSON.stringify(classificationMetadata), manualOverride,
      JSON.stringify(newsData.newsEvents || []), newsData.hasNews || false, newsData.sentiment, newsData.checkedAt,
      instrumentType || 'stock', strikePrice || null, expirationDate || null, optionType || null,
      contractSize || (instrumentType === 'option' ? 100 : null), underlyingSymbol || null,
      contractMonth || null, contractYear || null, tickSize || null, pointValue || null, underlyingAsset || null,
      importId || null,
      originalCurrency || 'USD', exchangeRate || 1.0, originalEntryPriceCurrency || null, originalExitPriceCurrency || null,
      originalPnlCurrency || null, originalCommissionCurrency || null, originalFeesCurrency || null,
      stopLoss || null, takeProfit || null, rValue
    ];

    const result = await db.query(query, values);
    const createdTrade = result.rows[0];

    // Log the strategy and setup assignment for debugging
    console.log(`[TRADE CREATE] Trade ${createdTrade.id}: strategy="${finalStrategy || 'null'}", setup="${setup || 'null'}", confidence=${strategyConfidence}%, method=${classificationMethod}`);
    
    // Check enrichment cache for existing data
    let appliedCachedData = false;
    if (!manualOverride && options.skipApiCalls) {
      try {
        const enrichmentCacheService = require('../services/enrichmentCacheService');
        appliedCachedData = await enrichmentCacheService.applyEnrichmentDataToTrade(
          createdTrade.id,
          symbol.toUpperCase(),
          finalEntryTime,
          new Date(finalEntryTime).toTimeString().substring(0, 8) // Convert to HH:MM:SS format
        );
        
        if (appliedCachedData) {
          console.log(`Applied cached enrichment data to trade ${createdTrade.id}`);
        }
      } catch (cacheError) {
        console.warn(`Failed to check enrichment cache for trade ${createdTrade.id}:`, cacheError.message);
      }
    }
    
    // Check if trade needs any enrichment (only if no cached data was applied)
    const needsEnrichment = (!appliedCachedData && shouldQueueClassification) || 
                           (symbol && symbol.match(/^[A-Z0-9]{8}[0-9]$/)); // CUSIP pattern
    
    // Queue strategy classification job if needed
    if (shouldQueueClassification) {
      try {
        const jobQueue = require('../utils/jobQueue');
        await jobQueue.addJob(
          'strategy_classification',
          {
            tradeId: createdTrade.id,
            symbol: symbol.toUpperCase(),
            entry_time: finalEntryTime,
            exit_time: cleanExitTime,
            entry_price: entryPrice,
            exit_price: cleanExitPrice,
            quantity,
            side,
            pnl,
            hold_time_minutes: cleanExitTime ? 
              (new Date(cleanExitTime) - new Date(finalEntryTime)) / (1000 * 60) : null
          },
          3, // Medium priority
          userId
        );
        console.log(`Queued strategy classification job for trade ${createdTrade.id}`);
      } catch (error) {
        console.warn(`Failed to queue strategy classification for trade ${createdTrade.id}:`, error.message);
      }
    }
    
    // If no enrichment is needed, mark as completed immediately
    if (!needsEnrichment) {
      try {
        await db.query(`
          UPDATE trades 
          SET enrichment_status = 'completed', 
              enrichment_completed_at = CURRENT_TIMESTAMP
          WHERE id = $1
        `, [createdTrade.id]);
        console.log(`Trade ${createdTrade.id} marked as enrichment completed (no enrichment needed)`);
      } catch (error) {
        console.warn(`Failed to update enrichment status for trade ${createdTrade.id}:`, error.message);
      }
    }
    
    // Check for new achievements (async, don't wait for completion)
    if (!options.skipAchievements) {
      AchievementService.checkAndAwardAchievements(userId).catch(error => {
        console.warn(`Failed to check achievements for user ${userId} after trade creation:`, error.message);
      });
      
      // Update trading streak (async, don't wait for completion)
      AchievementService.updateTradingStreak(userId).catch(error => {
        console.warn(`Failed to update trading streak for user ${userId} after trade creation:`, error.message);
      });
    }
    
    return createdTrade;
  }

  static async findById(id, userId = null) {
    let query = `
      SELECT t.*, u.username, u.avatar_url,
        t.strategy, t.setup,
        json_agg(
          json_build_object(
            'id', ta.id,
            'trade_id', ta.trade_id,
            'file_url', ta.file_url,
            'file_type', ta.file_type,
            'file_name', ta.file_name,
            'file_size', ta.file_size,
            'uploaded_at', ta.uploaded_at
          )
        ) FILTER (WHERE ta.id IS NOT NULL) as attachments,
        count(DISTINCT tc.id)::integer as comment_count,
        sc.finnhub_industry as sector,
        sc.company_name as company_name
      FROM trades t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN trade_attachments ta ON t.id = ta.trade_id
      LEFT JOIN trade_comments tc ON t.id = tc.trade_id
      LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
      WHERE t.id = $1
    `;

    const values = [id];

    if (userId) {
      query += ` AND (t.user_id = $2 OR t.is_public = true)`;
      values.push(userId);
    } else {
      query += ` AND t.is_public = true`;
    }

    query += ` GROUP BY t.id, u.username, u.avatar_url, sc.finnhub_industry, sc.company_name`;

    const result = await db.query(query, values);
    const trade = result.rows[0];
    
    // Parse executions from JSONB column if they exist
    if (trade && trade.executions) {
      try {
        trade.executions = typeof trade.executions === 'string' 
          ? JSON.parse(trade.executions) 
          : trade.executions;
      } catch (error) {
        console.warn(`Failed to parse executions for trade ${trade.id}:`, error.message);
        trade.executions = [];
      }
    } else if (trade) {
      trade.executions = [];
    }
    
    return trade;
  }

  static async findRoundTripById(id, userId) {
    // Query the round_trip_trades table using proper UUID
    const query = `
      SELECT 
        rt.*,
        array_agg(t.*) FILTER (WHERE t.id IS NOT NULL) as executions,
        COUNT(t.id) as execution_count
      FROM round_trip_trades rt
      LEFT JOIN trades t ON rt.id = t.round_trip_id
      WHERE rt.id = $1 AND rt.user_id = $2
      GROUP BY rt.id
    `;

    const result = await db.query(query, [id, userId]);
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    
    return {
      id: row.id,
      symbol: row.symbol,
      trade_date: row.entry_time ? new Date(row.entry_time).toISOString().split('T')[0] : null,
      pnl: parseFloat(row.total_pnl) || 0,
      pnl_percent: parseFloat(row.pnl_percent) || 0,
      commission: parseFloat(row.total_commission) || 0,
      fees: parseFloat(row.total_fees) || 0,
      execution_count: parseInt(row.execution_count) || 0,
      entry_time: row.entry_time,
      exit_time: row.exit_time,
      entry_price: parseFloat(row.entry_price) || 0,
      exit_price: parseFloat(row.exit_price) || 0,
      quantity: parseFloat(row.total_quantity) || 0,
      side: row.side,
      strategy: row.strategy || '',
      notes: row.notes || '',
      is_completed: row.is_completed,
      trade_type: 'round-trip',
      comment_count: 0,
      executions: row.executions || []
    };
  }

  static async findByUser(userId, filters = {}) {
    const { getUserTimezone } = require('../utils/timezone');
    let query = `
      SELECT t.*,
        t.strategy, t.setup,
        array_agg(DISTINCT ta.file_url) FILTER (WHERE ta.id IS NOT NULL) as attachment_urls,
        count(DISTINCT tc.id)::integer as comment_count,
        sc.finnhub_industry as sector,
        sc.company_name as company_name
      FROM trades t
      LEFT JOIN trade_attachments ta ON t.id = ta.trade_id
      LEFT JOIN trade_comments tc ON t.id = tc.trade_id
      LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
      WHERE t.user_id = $1
    `;

    const values = [userId];
    let paramCount = 2;

    if (filters.symbol) {
      // Enhanced symbol filtering to handle both ticker symbols and CUSIPs
      // This accounts for the fact that some trades may have CUSIPs stored in the symbol field
      // that should be mapped to ticker symbols for filtering
      // Check both global and user-specific CUSIP mappings
      // Also check if the search term might be a ticker that maps to a CUSIP in trades
      // Now supports partial matching with ILIKE
      query += ` AND (
        t.symbol ILIKE $${paramCount} || '%' OR
        EXISTS (
          SELECT 1 FROM cusip_mappings cm
          WHERE cm.cusip = t.symbol
          AND cm.ticker ILIKE $${paramCount} || '%'
          AND (cm.user_id = $1 OR cm.user_id IS NULL)
        ) OR
        EXISTS (
          SELECT 1 FROM cusip_mappings cm
          WHERE cm.ticker ILIKE $${paramCount} || '%'
          AND cm.cusip = t.symbol
          AND (cm.user_id = $1 OR cm.user_id IS NULL)
        )
      )`;
      values.push(filters.symbol.toUpperCase());
      paramCount++;
    }

    if (filters.startDate) {
      query += ` AND t.trade_date >= $${paramCount}`;
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      query += ` AND t.trade_date <= $${paramCount}`;
      values.push(filters.endDate);
      paramCount++;
    }

    if (filters.tags && filters.tags.length > 0) {
      console.log('[TAGS] Applying tag filter in Trade.findByUser:', filters.tags);
      query += ` AND t.tags && $${paramCount}`;
      values.push(filters.tags);
      paramCount++;
      console.log('[TAGS] Tag filter SQL added, value:', filters.tags);
    }

    // Multi-select strategies filter
    if (filters.strategies && filters.strategies.length > 0) {
      console.log('[TARGET] APPLYING MULTI-SELECT STRATEGIES:', filters.strategies);
      const placeholders = filters.strategies.map((_, index) => `$${paramCount + index}`).join(',');
      query += ` AND t.strategy IN (${placeholders})`;
      filters.strategies.forEach(strategy => values.push(strategy));
      paramCount += filters.strategies.length;
      console.log('[TARGET] Added strategies filter to query:', query.split('WHERE')[1]);
    }

    // Multi-select sectors filter  
    if (filters.sectors && filters.sectors.length > 0) {
      const placeholders = filters.sectors.map((_, index) => `$${paramCount + index}`).join(',');
      query += ` AND sc.finnhub_industry IN (${placeholders})`;
      filters.sectors.forEach(sector => values.push(sector));
      paramCount += filters.sectors.length;
    }

    // Single strategy filter (backward compatibility)
    // Strategy filter will be handled later with hold time analysis

    if (filters.sector) {
      query += ` AND sc.finnhub_industry = $${paramCount}`;
      values.push(filters.sector);
      paramCount++;
    }

    if (filters.hasNews !== undefined && filters.hasNews !== '' && filters.hasNews !== null) {
      console.log('[CHECK] hasNews filter detected:', { value: filters.hasNews, type: typeof filters.hasNews });
      if (filters.hasNews === 'true' || filters.hasNews === true || filters.hasNews === 1 || filters.hasNews === '1') {
        query += ` AND t.has_news = true`;
        console.log('[CHECK] Applied hasNews=true filter to query');
      } else if (filters.hasNews === 'false' || filters.hasNews === false || filters.hasNews === 0 || filters.hasNews === '0') {
        query += ` AND (t.has_news = false OR t.has_news IS NULL)`;
        console.log('[CHECK] Applied hasNews=false filter to query');
      }
    }

    // Advanced filters
    if (filters.side) {
      query += ` AND t.side = $${paramCount}`;
      values.push(filters.side);
      paramCount++;
    }

    if (filters.minPrice !== undefined) {
      query += ` AND t.entry_price >= $${paramCount}`;
      values.push(filters.minPrice);
      paramCount++;
    }

    if (filters.maxPrice !== undefined) {
      query += ` AND t.entry_price <= $${paramCount}`;
      values.push(filters.maxPrice);
      paramCount++;
    }

    if (filters.minQuantity !== undefined) {
      query += ` AND t.quantity >= $${paramCount}`;
      values.push(filters.minQuantity);
      paramCount++;
    }

    if (filters.maxQuantity !== undefined) {
      query += ` AND t.quantity <= $${paramCount}`;
      values.push(filters.maxQuantity);
      paramCount++;
    }

    if (filters.status === 'open') {
      query += ` AND t.exit_price IS NULL`;
    } else if (filters.status === 'closed') {
      query += ` AND t.exit_price IS NOT NULL`;
    }

    if (filters.minPnl !== undefined) {
      query += ` AND t.pnl >= $${paramCount}`;
      values.push(filters.minPnl);
      paramCount++;
    }

    if (filters.maxPnl !== undefined) {
      query += ` AND t.pnl <= $${paramCount}`;
      values.push(filters.maxPnl);
      paramCount++;
    }

    if (filters.pnlType === 'profit') {
      query += ` AND t.pnl > 0`;
    } else if (filters.pnlType === 'loss') {
      query += ` AND t.pnl < 0`;
    }

    // Days of week filter (timezone-aware)
    if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
      // Get user's timezone for accurate day calculation
      const userTimezone = await getUserTimezone(userId);
      console.log(`🕒 Using timezone ${userTimezone} for day-of-week filtering`);
      
      // Use entry_time converted to user's timezone for day calculation
      // This handles cases where trade_date might be wrong due to timezone issues
      const placeholders = filters.daysOfWeek.map((_, index) => `$${paramCount + index}`).join(',');
      if (userTimezone !== 'UTC') {
        query += ` AND extract(dow from (t.entry_time AT TIME ZONE 'UTC' AT TIME ZONE $${paramCount + filters.daysOfWeek.length})) IN (${placeholders})`;
        filters.daysOfWeek.forEach(dayNum => values.push(dayNum));
        values.push(userTimezone);
        paramCount += filters.daysOfWeek.length + 1;
      } else {
        // UTC case - can use simpler extraction
        query += ` AND extract(dow from t.entry_time) IN (${placeholders})`;
        filters.daysOfWeek.forEach(dayNum => values.push(dayNum));
        paramCount += filters.daysOfWeek.length;
      }
    }

    // Instrument types filter (stock, option, future)
    if (filters.instrumentTypes && filters.instrumentTypes.length > 0) {
      const placeholders = filters.instrumentTypes.map((_, index) => `$${paramCount + index}`).join(',');
      query += ` AND t.instrument_type IN (${placeholders})`;
      filters.instrumentTypes.forEach(type => values.push(type));
      paramCount += filters.instrumentTypes.length;
    }

    // Option types filter (call, put) - only applies to options
    if (filters.optionTypes && filters.optionTypes.length > 0) {
      const placeholders = filters.optionTypes.map((_, index) => `$${paramCount + index}`).join(',');
      query += ` AND t.option_type IN (${placeholders})`;
      filters.optionTypes.forEach(type => values.push(type));
      paramCount += filters.optionTypes.length;
    }

    // Broker filter - support both single and multi-select
    if (filters.brokers) {
      // Handle comma-separated string of brokers (from multi-select)
      const brokerList = filters.brokers.split(',').map(b => b.trim());
      if (brokerList.length > 0) {
        query += ` AND t.broker = ANY($${paramCount}::text[])`;
        values.push(brokerList);
        paramCount++;
      }
    } else if (filters.broker) {
      // Backward compatibility: single broker
      query += ` AND t.broker = $${paramCount}`;
      values.push(filters.broker);
      paramCount++;
    }

    // Quality grade filter - multi-select support (A, B, C, D, F)
    if (filters.qualityGrades && filters.qualityGrades.length > 0) {
      console.log('[QUALITY] Applying quality grade filter:', filters.qualityGrades);
      const placeholders = filters.qualityGrades.map((_, index) => `$${paramCount + index}`).join(',');
      query += ` AND t.quality_grade IN (${placeholders})`;
      filters.qualityGrades.forEach(grade => values.push(grade));
      paramCount += filters.qualityGrades.length;
      console.log('[QUALITY] Added quality filter to query, values:', filters.qualityGrades);
    }

    // Hold time filter
    if (filters.holdTime) {
      query += this.getHoldTimeFilter(filters.holdTime);
    }

    // Strategy filter
    if (filters.strategy) {
      query += this.getStrategyFilter(filters.strategy);
    }

    query += ` GROUP BY t.id, sc.finnhub_industry, sc.company_name ORDER BY t.trade_date DESC, t.entry_time DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
      paramCount++;
    }

    if (filters.offset) {
      query += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
    }

    const result = await db.query(query, values);
    return result.rows;
  }

  static async update(id, userId, updates, options = {}) {
    // First get the current trade data for calculations
    const currentTrade = await this.findById(id, userId);
    
    // Convert empty strings to null for optional fields
    if (updates.exitTime === '') updates.exitTime = null;
    if (updates.exitPrice === '') updates.exitPrice = null;
    
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Calculate trade_date based on exitTime or entryTime
    if (updates.exitTime) {
      updates.tradeDate = new Date(updates.exitTime).toISOString().split('T')[0];
    } else if (updates.entryTime) {
      // If we're updating entry time and there's no exit time, use entry time for trade date
      const exitTime = updates.exitTime || currentTrade.exit_time;
      if (!exitTime) {
        updates.tradeDate = new Date(updates.entryTime).toISOString().split('T')[0];
      }
    }

    // Check if user is manually setting strategy - do this first to prevent re-classification from overwriting it
    if (updates.strategy && !currentTrade.manual_override) {
      // User is manually setting strategy - mark as override
      updates.manualOverride = true;
      updates.strategyConfidence = 100;
      updates.classificationMethod = 'manual';
      updates.classificationMetadata = { 
        userProvided: true, 
        overrideTimestamp: new Date().toISOString() 
      };
    }

    // Check if we need to re-classify strategy
    // Skip reclassification if skipApiCalls is set (e.g., during bulk imports)
    // Also skip if user is manually setting strategy (already handled above)
    const shouldReclassify = !options.skipApiCalls && !currentTrade.manual_override && !updates.strategy && (
      updates.exitTime || updates.exitPrice || updates.entryTime || updates.entryPrice
    );

    if (shouldReclassify) {
      // Create updated trade object for re-classification
      const updatedTrade = {
        symbol: currentTrade.symbol,
        entry_time: updates.entryTime || currentTrade.entry_time,
        exit_time: updates.exitTime || currentTrade.exit_time,
        entry_price: updates.entryPrice || currentTrade.entry_price,
        exit_price: updates.exitPrice || currentTrade.exit_price,
        quantity: updates.quantity || currentTrade.quantity,
        side: updates.side || currentTrade.side,
        pnl: null, // Will be calculated
        hold_time_minutes: null // Will be calculated
      };

      // Calculate updated P&L and hold time
      updatedTrade.pnl = this.calculatePnL(
        updatedTrade.entry_price,
        updatedTrade.exit_price,
        updatedTrade.quantity,
        updatedTrade.side,
        updates.commission || currentTrade.commission,
        updates.fees || currentTrade.fees,
        updates.instrumentType || currentTrade.instrument_type || 'stock',
        updates.contractSize || currentTrade.contract_size || 1
      );

      if (updatedTrade.exit_time) {
        updatedTrade.hold_time_minutes = 
          (new Date(updatedTrade.exit_time) - new Date(updatedTrade.entry_time)) / (1000 * 60);
      }

      try {
        // Re-classify with enhanced analysis if complete, otherwise basic
        const classification = updatedTrade.exit_time && updatedTrade.exit_price ? 
          await this.classifyTradeStrategyWithAnalysis(updatedTrade, userId) :
          await this.classifyTradeBasic(updatedTrade);

        if (typeof classification === 'object') {
          updates.strategy = classification.strategy;
          updates.strategyConfidence = Math.round((classification.confidence || 0.5) * 100);
          updates.classificationMethod = classification.method || (updatedTrade.exit_time ? 'technical_analysis' : 'time_based_partial');
          updates.classificationMetadata = {
            signals: classification.signals || [],
            holdTimeMinutes: classification.holdTimeMinutes,
            priceMove: classification.priceMove,
            analysisTimestamp: new Date().toISOString(),
            reclassified: true
          };
        } else {
          updates.strategy = classification;
          updates.strategyConfidence = 70;
          updates.classificationMethod = 'time_based';
          updates.classificationMetadata = {
            holdTimeMinutes: updatedTrade.hold_time_minutes,
            analysisTimestamp: new Date().toISOString(),
            reclassified: true
          };
        }

        console.log(`Re-classified trade ${id} as "${updates.strategy}" with ${updates.strategyConfidence}% confidence`);
      } catch (error) {
        console.warn('Error in trade re-classification:', error.message);
        // Don't fail the update, just keep existing strategy
      }
    }

    // Special handling for executions to merge instead of replace
    let mergedExecutions = null;
    if (updates.executions) {
      // Get existing executions from current trade
      let existingExecutions = [];
      try {
        existingExecutions = currentTrade.executions
          ? (typeof currentTrade.executions === 'string'
              ? JSON.parse(currentTrade.executions)
              : currentTrade.executions)
          : [];
      } catch (e) {
        console.warn(`Failed to parse existing executions for trade ${id}:`, e.message);
        existingExecutions = [];
      }

      // Get new executions from updates
      const newExecutions = updates.executions;

      console.log(`\n=== EXECUTION MERGE DEBUG for Trade ${id} ===`);
      console.log(`Current trade symbol: ${currentTrade.symbol}`);
      console.log(`Existing executions count: ${existingExecutions.length}`);
      if (existingExecutions.length > 0) {
        console.log(`First existing execution: ${existingExecutions[0].datetime} @ $${existingExecutions[0].price}`);
        console.log(`Last existing execution: ${existingExecutions[existingExecutions.length-1].datetime} @ $${existingExecutions[existingExecutions.length-1].price}`);
      }
      console.log(`New executions count: ${newExecutions.length}`);
      if (newExecutions.length > 0) {
        console.log(`First new execution: ${newExecutions[0].datetime} @ $${newExecutions[0].price}`);
        console.log(`Last new execution: ${newExecutions[newExecutions.length-1].datetime} @ $${newExecutions[newExecutions.length-1].price}`);
      }

      // Create a set of existing execution timestamps for fast lookup
      const existingTimestamps = new Set(
        existingExecutions.map(exec => {
          const timestamp = new Date(exec.datetime).getTime();
          console.log(`  Existing timestamp: ${exec.datetime} -> ${timestamp}`);
          return timestamp;
        })
      );

      // Filter out duplicate executions from new executions
      const uniqueNewExecutions = newExecutions.filter(exec => {
        const execTime = new Date(exec.datetime).getTime();
        const isDuplicate = existingTimestamps.has(execTime);
        console.log(`  Checking new: ${exec.datetime} -> ${execTime} -> ${isDuplicate ? 'DUPLICATE' : 'UNIQUE'}`);
        return !isDuplicate;
      });

      console.log(`RESULT: ${existingExecutions.length} existing + ${uniqueNewExecutions.length} unique new = ${existingExecutions.length + uniqueNewExecutions.length} total`);
      console.log(`=== END EXECUTION MERGE DEBUG ===\n`);
      
      // Merge existing and new executions
      mergedExecutions = [...existingExecutions, ...uniqueNewExecutions];
      
      // Remove executions from updates since we'll handle it separately
      delete updates.executions;
    }

    // Process all other fields
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'user_id' && key !== 'created_at') {
        // Convert camelCase to snake_case for database columns
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        fields.push(`${dbKey} = $${paramCount}`);

        // Handle JSON/JSONB fields that need serialization
        if (key === 'classificationMetadata' || key === 'newsEvents') {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }

        // Log strategy and setup updates
        if (key === 'strategy' || key === 'setup') {
          console.log(`[TRADE UPDATE] Setting ${key}="${value}" for trade ${id}`);
        }

        paramCount++;
      }
    });
    
    // Add merged executions if we have them
    if (mergedExecutions !== null) {
      fields.push(`executions = $${paramCount}`);
      values.push(JSON.stringify(mergedExecutions));
      paramCount++;
    }

    if (updates.entryPrice || updates.exitPrice || updates.quantity || updates.side || updates.commission || updates.fees || updates.instrumentType || updates.contractSize) {
      const instrumentType = updates.instrumentType || currentTrade.instrument_type || 'stock';
      const quantity = updates.quantity || currentTrade.quantity;
      const pointValue = updates.pointValue || currentTrade.point_value;
      const contractSize = updates.contractSize || currentTrade.contract_size || 1;

      const pnl = this.calculatePnL(
        updates.entryPrice || currentTrade.entry_price,
        updates.exitPrice || currentTrade.exit_price,
        quantity,
        updates.side || currentTrade.side,
        updates.commission || currentTrade.commission,
        updates.fees || currentTrade.fees,
        instrumentType,
        contractSize,
        pointValue
      );
      const pnlPercent = this.calculatePnLPercent(
        updates.entryPrice || currentTrade.entry_price,
        updates.exitPrice || currentTrade.exit_price,
        updates.side || currentTrade.side,
        pnl,
        quantity,
        instrumentType,
        pointValue
      );

      fields.push(`pnl = $${paramCount}`);
      values.push(pnl);
      paramCount++;

      fields.push(`pnl_percent = $${paramCount}`);
      values.push(pnlPercent);
      paramCount++;
    }

    // Recalculate R-Multiple if any of the relevant fields are updated
    // Note: takeProfit does NOT affect R-Multiple calculation (only exitPrice matters)
    if (updates.entryPrice !== undefined || updates.exitPrice !== undefined ||
        updates.stopLoss !== undefined || updates.side) {
      const entryPrice = updates.entryPrice || currentTrade.entry_price;
      const exitPrice = updates.exitPrice !== undefined ? updates.exitPrice : currentTrade.exit_price;
      const stopLoss = updates.stopLoss !== undefined ? updates.stopLoss : currentTrade.stop_loss;
      const side = updates.side || currentTrade.side;

      console.log('[R-MULTIPLE CALC] Inputs:', { entryPrice, stopLoss, exitPrice, side });

      // Calculate R-Multiple if stop loss and exit price are provided
      // R-Multiple measures actual performance vs initial risk
      const rValue = (stopLoss && exitPrice && entryPrice && side)
        ? this.calculateRValue(entryPrice, stopLoss, exitPrice, side)
        : null;

      console.log('[R-MULTIPLE CALC] Result:', rValue);

      fields.push(`r_value = $${paramCount}`);
      values.push(rValue);
      paramCount++;
    }

    // Ensure tags exist in tags table if tags are being updated
    if (updates.tags && updates.tags.length > 0) {
      await this.ensureTagsExist(userId, updates.tags);
    }

    values.push(id);
    values.push(userId);

    const query = `
      UPDATE trades
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await db.query(query, values);
    
    // Check for new achievements after trade update (async, don't wait for completion)
    if (!options.skipAchievements) {
      AchievementService.checkAndAwardAchievements(userId).catch(error => {
        console.warn(`Failed to check achievements for user ${userId} after trade update:`, error.message);
      });
      
      // Update trading streak (async, don't wait for completion)  
      AchievementService.updateTradingStreak(userId).catch(error => {
        console.warn(`Failed to update trading streak for user ${userId} after trade update:`, error.message);
      });
    }
    
    return result.rows[0];
  }

  static async delete(id, userId) {
    try {
      // Start transaction to ensure both trade and jobs are deleted together
      await db.query('BEGIN');
      
      // First, delete associated jobs to prevent orphaned jobs
      const jobDeleteQuery = `
        DELETE FROM job_queue 
        WHERE data->>'tradeId' = $1
        OR (data->'tradeIds' ? $1)
        RETURNING id, type
      `;
      
      const deletedJobs = await db.query(jobDeleteQuery, [id]);
      
      if (deletedJobs.rows.length > 0) {
        console.log(`Deleted ${deletedJobs.rows.length} jobs for trade ${id}`);
      }
      
      // Then delete the trade
      const tradeDeleteQuery = `
        DELETE FROM trades
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `;
      
      const result = await db.query(tradeDeleteQuery, [id, userId]);
      
      if (result.rows.length === 0) {
        await db.query('ROLLBACK');
        return null; // Trade not found or doesn't belong to user
      }
      
      await db.query('COMMIT');
      console.log(`Successfully deleted trade ${id} and its associated jobs`);
      
      return result.rows[0];
      
    } catch (error) {
      await db.query('ROLLBACK');
      console.error(`Failed to delete trade ${id}:`, error.message);
      throw error;
    }
  }

  static async addAttachment(tradeId, attachmentData) {
    const { fileUrl, fileType, fileName, fileSize } = attachmentData;

    const query = `
      INSERT INTO trade_attachments (trade_id, file_url, file_type, file_name, file_size)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const result = await db.query(query, [tradeId, fileUrl, fileType, fileName, fileSize]);
    return result.rows[0];
  }

  static async deleteAttachment(attachmentId, userId) {
    const query = `
      DELETE FROM trade_attachments ta
      USING trades t
      WHERE ta.id = $1 AND ta.trade_id = t.id AND t.user_id = $2
      RETURNING ta.id
    `;

    const result = await db.query(query, [attachmentId, userId]);
    return result.rows[0];
  }

  static async getPublicTrades(filters = {}) {
    let query = `
      SELECT t.*, u.username, u.avatar_url,
        array_agg(DISTINCT ta.file_url) FILTER (WHERE ta.id IS NOT NULL) as attachment_urls,
        count(DISTINCT tc.id)::integer as comment_count
      FROM trades t
      JOIN users u ON t.user_id = u.id
      JOIN user_settings us ON u.id = us.user_id
      LEFT JOIN trade_attachments ta ON t.id = ta.trade_id
      LEFT JOIN trade_comments tc ON t.id = tc.trade_id
      WHERE t.is_public = true AND us.public_profile = true
    `;

    const values = [];
    let paramCount = 1;

    if (filters.symbol) {
      query += ` AND t.symbol ILIKE $${paramCount} || '%'`;
      values.push(filters.symbol.toUpperCase());
      paramCount++;
    }

    if (filters.username) {
      query += ` AND u.username = $${paramCount}`;
      values.push(filters.username);
      paramCount++;
    }

    query += ` GROUP BY t.id, u.username, u.avatar_url ORDER BY t.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
      paramCount++;
    }

    if (filters.offset) {
      query += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
    }

    const result = await db.query(query, values);
    return result.rows;
  }

  static calculatePnL(entryPrice, exitPrice, quantity, side, commission = 0, fees = 0, instrumentType = 'stock', contractSize = 1, pointValue = null) {
    if (!exitPrice || !entryPrice || quantity <= 0) return null;

    // Determine the multiplier based on instrument type
    let multiplier;
    if (instrumentType === 'future') {
      // For futures, use point value (e.g., $5 per point for ES, $2 for MNQ)
      multiplier = pointValue || 1;
    } else if (instrumentType === 'option') {
      // For options, use contract size (typically 100 shares per contract)
      multiplier = contractSize || 100;
    } else {
      // For stocks, no multiplier needed (1 share = 1 share)
      multiplier = 1;
    }

    let pnl;
    if (side === 'long') {
      pnl = (exitPrice - entryPrice) * quantity * multiplier;
    } else {
      pnl = (entryPrice - exitPrice) * quantity * multiplier;
    }

    const totalPnL = pnl - commission - fees;

    // Guard against NaN, Infinity, or values that exceed database limits
    if (!isFinite(totalPnL) || Math.abs(totalPnL) > 99999999) {
      return null;
    }

    return totalPnL;
  }

  static calculatePnLPercent(entryPrice, exitPrice, side, pnl = null, quantity = null, instrumentType = 'stock', pointValue = null) {
    if (!exitPrice || !entryPrice || entryPrice <= 0) return null;

    let pnlPercent;

    // For futures, calculate ROI based on P&L vs notional value
    if (instrumentType === 'future' && pnl !== null && quantity !== null) {
      // Calculate notional value of the position
      // For futures: notional = entry_price × quantity × point_value
      const effectivePointValue = pointValue || 1; // Default to 1 if not provided
      const notionalValue = entryPrice * quantity * effectivePointValue;

      if (notionalValue > 0) {
        pnlPercent = (pnl / notionalValue) * 100;
      } else {
        // Fallback to price-based calculation if notional value is invalid
        if (side === 'long') {
          pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
        } else {
          pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
        }
      }
    } else {
      // Standard calculation for stocks and options
      if (side === 'long') {
        pnlPercent = ((exitPrice - entryPrice) / entryPrice) * 100;
      } else {
        pnlPercent = ((entryPrice - exitPrice) / entryPrice) * 100;
      }
    }

    // Guard against NaN, Infinity, or values that exceed database limits
    if (!isFinite(pnlPercent) || Math.abs(pnlPercent) > 999999) {
      return null;
    }

    return pnlPercent;
  }

  /**
   * Calculate R-Multiple (Actual Risk/Reward achieved)
   * R-Multiple represents the actual profit/loss in terms of initial risk (R)
   *
   * R-Multiple = Actual P/L / Initial Risk
   *
   * For Long positions:
   *   - Risk = entryPrice - stopLoss
   *   - Actual P/L = exitPrice - entryPrice
   *   - R-Multiple = (exitPrice - entryPrice) / (entryPrice - stopLoss)
   *
   * For Short positions:
   *   - Risk = stopLoss - entryPrice
   *   - Actual P/L = entryPrice - exitPrice
   *   - R-Multiple = (entryPrice - exitPrice) / (stopLoss - entryPrice)
   *
   * Examples:
   *   - R-Multiple of 2.0 means you made 2x your initial risk
   *   - R-Multiple of -1.0 means you lost exactly your initial risk (stop loss hit)
   *   - R-Multiple of 0 means you broke even at entry price
   *
   * @param {number} entryPrice - The entry price of the trade
   * @param {number} stopLoss - The stop loss price level
   * @param {number} exitPrice - The actual exit price of the trade
   * @param {string} side - The trade side ('long' or 'short')
   * @returns {number|null} The calculated R-Multiple, or null if inputs are invalid
   */
  static calculateRValue(entryPrice, stopLoss, exitPrice, side) {
    // Validate inputs - exitPrice is required, not takeProfit
    if (!entryPrice || !stopLoss || !exitPrice || !side) {
      console.warn('[R-MULTIPLE] Missing required inputs:', { entryPrice, stopLoss, exitPrice, side });
      return null;
    }

    // Ensure all values are positive
    if (entryPrice <= 0 || stopLoss <= 0 || exitPrice <= 0) {
      console.warn('[R-MULTIPLE] All values must be positive:', { entryPrice, stopLoss, exitPrice });
      return null;
    }

    let risk;
    let actualPL;

    if (side === 'long') {
      // For long positions:
      // Risk = entry price - stop loss (how much we risked)
      // Actual P/L = exit price - entry price (what we actually made/lost)
      risk = entryPrice - stopLoss;
      actualPL = exitPrice - entryPrice;

      // Validation: stop loss should be below entry for long
      if (stopLoss >= entryPrice) {
        console.warn('[R-MULTIPLE] Warning: stop loss should be below entry for long positions');
        return null;
      }
    } else if (side === 'short') {
      // For short positions:
      // Risk = stop loss - entry price (how much we risked)
      // Actual P/L = entry price - exit price (what we actually made/lost)
      risk = stopLoss - entryPrice;
      actualPL = entryPrice - exitPrice;

      // Validation: stop loss should be above entry for short
      if (stopLoss <= entryPrice) {
        console.warn('[R-MULTIPLE] Warning: stop loss should be above entry for short positions');
        return null;
      }
    } else {
      console.warn('[R-MULTIPLE] Invalid side value:', side);
      return null;
    }

    // Calculate R-Multiple as actual P/L divided by risk
    if (risk <= 0) {
      console.warn('[R-MULTIPLE] Risk must be positive, got:', risk);
      return null;
    }

    const rMultiple = actualPL / risk;

    // Guard against NaN or Infinity (negative values are allowed)
    if (!isFinite(rMultiple)) {
      console.warn('[R-MULTIPLE] Invalid calculated R-Multiple:', rMultiple);
      return null;
    }

    // Round to 2 decimal places
    return Math.round(rMultiple * 100) / 100;
  }

  static async getCountWithFilters(userId, filters = {}) {
    const { getUserTimezone } = require('../utils/timezone');
    console.log('[COUNT] getCountWithFilters called with userId:', userId, 'filters:', filters);
    
    // Count query with optional join for sectors
    let needsJoin = (filters.sectors && filters.sectors.length > 0) || filters.sector;
    
    let query = needsJoin 
      ? `SELECT COUNT(DISTINCT t.id) as total FROM trades t LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol WHERE t.user_id = $1`
      : `SELECT COUNT(*) as total FROM trades WHERE user_id = $1`;
    
    const values = [userId];
    let paramCount = 2;

    // Only apply the most common filters to avoid SQL errors
    const tablePrefix = needsJoin ? 't.' : '';
    
    if (filters.symbol && filters.symbol.trim()) {
      query += ` AND ${tablePrefix}symbol ILIKE $${paramCount} || '%'`;
      values.push(filters.symbol.toUpperCase().trim());
      paramCount++;
    }

    if (filters.startDate && filters.startDate.trim()) {
      query += ` AND ${tablePrefix}trade_date >= $${paramCount}`;
      values.push(filters.startDate.trim());
      paramCount++;
    }

    if (filters.endDate && filters.endDate.trim()) {
      query += ` AND ${tablePrefix}trade_date <= $${paramCount}`;
      values.push(filters.endDate.trim());
      paramCount++;
    }

    if (filters.side && filters.side.trim()) {
      query += ` AND ${tablePrefix}side = $${paramCount}`;
      values.push(filters.side.trim());
      paramCount++;
    }

    if (filters.pnlType === 'profit') {
      query += ` AND ${tablePrefix}pnl > 0`;
    } else if (filters.pnlType === 'loss') {
      query += ` AND ${tablePrefix}pnl < 0`;
    }

    if (filters.status === 'open') {
      query += ` AND ${tablePrefix}exit_price IS NULL`;
    } else if (filters.status === 'closed') {
      query += ` AND ${tablePrefix}exit_price IS NOT NULL`;
    }

    if (filters.hasNews !== undefined && filters.hasNews !== '' && filters.hasNews !== null) {
      if (filters.hasNews === 'true' || filters.hasNews === true || filters.hasNews === 1 || filters.hasNews === '1') {
        query += ` AND ${tablePrefix}has_news = true`;
      } else if (filters.hasNews === 'false' || filters.hasNews === false || filters.hasNews === 0 || filters.hasNews === '0') {
        query += ` AND (${tablePrefix}has_news = false OR ${tablePrefix}has_news IS NULL)`;
      }
    }

    // Multi-select strategies filter for count
    if (filters.strategies && filters.strategies.length > 0) {
      const placeholders = filters.strategies.map((_, index) => `$${paramCount + index}`).join(',');
      query += ` AND ${tablePrefix}strategy IN (${placeholders})`;
      filters.strategies.forEach(strategy => values.push(strategy));
      paramCount += filters.strategies.length;
    } else if (filters.strategy && filters.strategy.trim()) {
      query += ` AND ${tablePrefix}strategy = $${paramCount}`;
      values.push(filters.strategy.trim());
      paramCount++;
    }

    // Multi-select sectors filter for count  
    if (filters.sectors && filters.sectors.length > 0) {
      const sectorPlaceholders = filters.sectors.map((_, index) => `$${paramCount + index}`).join(',');
      query += ` AND sc.finnhub_industry IN (${sectorPlaceholders})`;
      filters.sectors.forEach(sector => values.push(sector));
      paramCount += filters.sectors.length;
    }

    // Single sector filter for count
    if (filters.sector && filters.sector.trim()) {
      query += ` AND sc.finnhub_industry = $${paramCount}`;
      values.push(filters.sector.trim());
      paramCount++;
    }

    // Days of week filter for count (timezone-aware)
    if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
      const userTimezone = await getUserTimezone(userId);
      const placeholders = filters.daysOfWeek.map((_, index) => `$${paramCount + index}`).join(',');
      
      if (userTimezone !== 'UTC') {
        query += ` AND extract(dow from (${tablePrefix}entry_time AT TIME ZONE 'UTC' AT TIME ZONE $${paramCount + filters.daysOfWeek.length})) IN (${placeholders})`;
        filters.daysOfWeek.forEach(dayNum => values.push(dayNum));
        values.push(userTimezone);
        paramCount += filters.daysOfWeek.length + 1;
      } else {
        query += ` AND extract(dow from ${tablePrefix}entry_time) IN (${placeholders})`;
        filters.daysOfWeek.forEach(dayNum => values.push(dayNum));
        paramCount += filters.daysOfWeek.length;
      }
    }

    console.log('[COUNT] Count query:', query);
    console.log('[COUNT] Count values:', values);
    
    const result = await db.query(query, values);
    const total = parseInt(result.rows[0].total) || 0;
    
    console.log('[COUNT] Count result:', total);
    return total;
  }

  static async getAnalytics(userId, filters = {}) {
    const { getUserTimezone } = require('../utils/timezone');
    console.log('Getting analytics for user:', userId, 'with filters:', filters);
    
    // Get user's preference for average vs median calculations
    const User = require('./User');
    let useMedian = false;
    try {
      const userSettings = await User.getSettings(userId);
      useMedian = userSettings?.statistics_calculation === 'median';
    } catch (error) {
      console.warn('Could not fetch user settings for analytics, using default (average):', error.message);
      useMedian = false;
    }
    
    // First, check what data exists in the database
    const dataCheckQuery = `
      SELECT 
        COUNT(*) as total_trades,
        COUNT(*) FILTER (WHERE pnl IS NOT NULL) as trades_with_pnl,
        COUNT(*) FILTER (WHERE exit_price IS NOT NULL) as trades_with_exit,
        MIN(trade_date) as earliest_date,
        MAX(trade_date) as latest_date
      FROM trades 
      WHERE user_id = $1
    `;
    const dataCheck = await db.query(dataCheckQuery, [userId]);
    console.log('Analytics: Database data check:', dataCheck.rows[0]);
    
    // Make analytics less restrictive - only require user_id
    let whereClause = 'WHERE t.user_id = $1';
    const values = [userId];
    let paramCount = 2;

    // Add date filtering
    if (filters.startDate) {
      whereClause += ` AND t.trade_date >= $${paramCount}`;
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      whereClause += ` AND t.trade_date <= $${paramCount}`;
      values.push(filters.endDate);
      paramCount++;
    }

    if (filters.symbol) {
      whereClause += ` AND t.symbol ILIKE $${paramCount} || '%'`;
      values.push(filters.symbol.toUpperCase());
      paramCount++;
    }
   // Broker filtering
   if (filters.broker) {
     whereClause += ` AND t.broker = $${paramCount}`;
     values.push(filters.broker);
     paramCount++;
   } else if (filters.brokers) {
     // If brokers filter is provided as a comma-separated string, split it into an array and filter using ANY()
     const brokerList = filters.brokers.split(',').map(b => b.trim()).filter(b => b);
     if (brokerList.length > 0) {
       whereClause += ` AND t.broker = ANY($${paramCount}::text[])`;
       values.push(brokerList);
       paramCount++;
     }
   }

    // Sector filter (requires join with symbol_categories)
    if (filters.sector) {
      whereClause += ` AND EXISTS (SELECT 1 FROM symbol_categories sc WHERE sc.symbol = t.symbol AND sc.finnhub_industry = $${paramCount})`;
      values.push(filters.sector);
      paramCount++;
    }

    // Advanced filters
    if (filters.side) {
      whereClause += ` AND t.side = $${paramCount}`;
      values.push(filters.side);
      paramCount++;
    }

    if (filters.minPrice !== undefined && filters.minPrice !== null && filters.minPrice !== '') {
      whereClause += ` AND t.entry_price >= $${paramCount}`;
      values.push(filters.minPrice);
      paramCount++;
    }

    if (filters.maxPrice !== undefined && filters.maxPrice !== null && filters.maxPrice !== '') {
      whereClause += ` AND t.entry_price <= $${paramCount}`;
      values.push(filters.maxPrice);
      paramCount++;
    }

    if (filters.minQuantity !== undefined && filters.minQuantity !== null && filters.minQuantity !== '') {
      whereClause += ` AND t.quantity >= $${paramCount}`;
      values.push(filters.minQuantity);
      paramCount++;
    }

    if (filters.maxQuantity !== undefined && filters.maxQuantity !== null && filters.maxQuantity !== '') {
      whereClause += ` AND t.quantity <= $${paramCount}`;
      values.push(filters.maxQuantity);
      paramCount++;
    }

    if (filters.status === 'open') {
      whereClause += ` AND t.exit_price IS NULL`;
    } else if (filters.status === 'closed') {
      whereClause += ` AND t.exit_price IS NOT NULL`;
    }

    if (filters.minPnl !== undefined && filters.minPnl !== null && filters.minPnl !== '') {
      whereClause += ` AND t.pnl >= $${paramCount}`;
      values.push(filters.minPnl);
      paramCount++;
    }

    if (filters.maxPnl !== undefined && filters.maxPnl !== null && filters.maxPnl !== '') {
      whereClause += ` AND t.pnl <= $${paramCount}`;
      values.push(filters.maxPnl);
      paramCount++;
    }

    if (filters.pnlType === 'positive' || filters.pnlType === 'profit') {
      whereClause += ` AND t.pnl > 0`;
    } else if (filters.pnlType === 'negative' || filters.pnlType === 'loss') {
      whereClause += ` AND t.pnl < 0`;
    } else if (filters.pnlType === 'breakeven') {
      whereClause += ` AND t.pnl = 0`;
    }

    // Broker filter - support both single and multi-select
    if (filters.brokers) {
      // Handle comma-separated string of brokers (from multi-select)
      const brokerList = filters.brokers.split(',').map(b => b.trim());
      if (brokerList.length > 0) {
        console.log('[TARGET] ANALYTICS: APPLYING MULTI-SELECT BROKERS:', brokerList);
        const placeholders = brokerList.map((_, index) => `$${paramCount + index}`).join(',');
        whereClause += ` AND t.broker IN (${placeholders})`;
        brokerList.forEach(broker => values.push(broker));
        paramCount += brokerList.length;
      }
    } else if (filters.broker) {
      // Backward compatibility: single broker
      whereClause += ` AND t.broker = $${paramCount}`;
      values.push(filters.broker);
      paramCount++;
    }

    // Tags filter for analytics
    if (filters.tags && filters.tags.length > 0) {
      console.log('[TAGS] ANALYTICS: APPLYING TAGS FILTER:', filters.tags);
      whereClause += ` AND t.tags && $${paramCount}`;
      values.push(filters.tags);
      paramCount++;
    }

    // Multi-select strategies filter for analytics
    if (filters.strategies && filters.strategies.length > 0) {
      console.log('[TARGET] ANALYTICS: APPLYING MULTI-SELECT STRATEGIES:', filters.strategies);
      const placeholders = filters.strategies.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND t.strategy IN (${placeholders})`;
      filters.strategies.forEach(strategy => values.push(strategy));
      paramCount += filters.strategies.length;
    } else if (filters.strategy) {
      whereClause += ` AND t.strategy = $${paramCount}`;
      values.push(filters.strategy);
      paramCount++;
    }

    // Multi-select sectors filter for analytics
    if (filters.sectors && filters.sectors.length > 0) {
      console.log('[TARGET] ANALYTICS: APPLYING MULTI-SELECT SECTORS:', filters.sectors);
      const sectorPlaceholders = filters.sectors.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND t.symbol IN (SELECT sc.symbol FROM symbol_categories sc WHERE sc.finnhub_industry IN (${sectorPlaceholders}))`;
      filters.sectors.forEach(sector => values.push(sector));
      paramCount += filters.sectors.length;
    }

    // Hold time filter for analytics
    if (filters.holdTime) {
      whereClause += this.getHoldTimeFilter(filters.holdTime);
    }

    // News filter for analytics
    if (filters.hasNews !== undefined && filters.hasNews !== '' && filters.hasNews !== null) {
      if (filters.hasNews === 'true' || filters.hasNews === true || filters.hasNews === 1 || filters.hasNews === '1') {
        whereClause += ` AND t.has_news = true`;
      } else if (filters.hasNews === 'false' || filters.hasNews === false || filters.hasNews === 0 || filters.hasNews === '0') {
        whereClause += ` AND (t.has_news = false OR t.has_news IS NULL)`;
      }
    }

    // Days of week filter for analytics (timezone-aware)
    if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
      const userTimezone = await getUserTimezone(userId);
      const placeholders = filters.daysOfWeek.map((_, index) => `$${paramCount + index}`).join(',');

      if (userTimezone !== 'UTC') {
        whereClause += ` AND extract(dow from (t.entry_time AT TIME ZONE 'UTC' AT TIME ZONE $${paramCount + filters.daysOfWeek.length})) IN (${placeholders})`;
        filters.daysOfWeek.forEach(dayNum => values.push(dayNum));
        values.push(userTimezone);
        paramCount += filters.daysOfWeek.length + 1;
      } else {
        whereClause += ` AND extract(dow from t.entry_time) IN (${placeholders})`;
        filters.daysOfWeek.forEach(dayNum => values.push(dayNum));
        paramCount += filters.daysOfWeek.length;
      }
    }

    // Instrument types filter (stock, option, future)
    if (filters.instrumentTypes && filters.instrumentTypes.length > 0) {
      const placeholders = filters.instrumentTypes.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND t.instrument_type IN (${placeholders})`;
      filters.instrumentTypes.forEach(type => values.push(type));
      paramCount += filters.instrumentTypes.length;
    }

    // Quality grade filter - multi-select support (A, B, C, D, F)
    if (filters.qualityGrades && filters.qualityGrades.length > 0) {
      console.log('[QUALITY] ANALYTICS: Applying quality grade filter:', filters.qualityGrades);
      const placeholders = filters.qualityGrades.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND t.quality_grade IN (${placeholders})`;
      filters.qualityGrades.forEach(grade => values.push(grade));
      paramCount += filters.qualityGrades.length;
      console.log('[QUALITY] ANALYTICS: Added quality filter to query, values:', filters.qualityGrades);
    }

    console.log('Analytics query - whereClause:', whereClause);
    console.log('Analytics query - values:', values);
    
    // Debug the full query construction
    console.log('[CHECK] About to execute analytics query with', values.length, 'parameters');
    
    // First, let's count executions (individual database records)
    const executionCountQuery = `
      SELECT COUNT(*) as execution_count
      FROM trades t
      ${whereClause}
    `;
    
    let executionCount = 0;
    try {
      console.log('[CHECK] Executing execution count query:', executionCountQuery);
      const executionResult = await db.query(executionCountQuery, values);
      executionCount = parseInt(executionResult.rows[0].execution_count) || 0;
      console.log('Total executions:', executionCount);
    } catch (error) {
      console.error('[ERROR] ERROR in execution count query:', error.message);
      console.error('[ERROR] Query was:', executionCountQuery);
      console.error('[ERROR] Values were:', values);
      throw error;
    }

    const analyticsQuery = `
      WITH completed_trades AS (
        -- Each trade with exit price is a complete round trip
        SELECT
          symbol,
          id as trade_group,
          pnl as trade_pnl,
          (commission + fees) as trade_costs,
          1 as execution_count,
          pnl_percent as avg_return_pct,
          trade_date as first_trade_date,
          entry_time as first_entry,
          COALESCE(exit_time, entry_time) as last_exit,
          r_value
        FROM trades t
        ${whereClause}
          AND exit_price IS NOT NULL
          AND pnl IS NOT NULL
      ),
      trade_stats AS (
        SELECT
          COUNT(*)::integer as total_trades,
          COUNT(*) FILTER (WHERE trade_pnl > 0)::integer as winning_trades,
          COUNT(*) FILTER (WHERE trade_pnl < 0)::integer as losing_trades,
          COUNT(*) FILTER (WHERE trade_pnl = 0)::integer as breakeven_trades,
          COALESCE(SUM(trade_pnl), 0)::numeric as total_pnl,
          ${useMedian
            ? 'COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY trade_pnl), 0)::numeric as avg_pnl'
            : 'COALESCE(AVG(trade_pnl), 0)::numeric as avg_pnl'
          },
          ${useMedian
            ? 'COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY trade_pnl) FILTER (WHERE trade_pnl > 0), 0)::numeric as avg_win'
            : 'COALESCE(AVG(trade_pnl) FILTER (WHERE trade_pnl > 0), 0)::numeric as avg_win'
          },
          ${useMedian
            ? 'COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY trade_pnl) FILTER (WHERE trade_pnl < 0), 0)::numeric as avg_loss'
            : 'COALESCE(AVG(trade_pnl) FILTER (WHERE trade_pnl < 0), 0)::numeric as avg_loss'
          },
          COALESCE(MAX(trade_pnl), 0)::numeric as best_trade,
          COALESCE(MIN(trade_pnl), 0)::numeric as worst_trade,
          COALESCE(SUM(trade_costs), 0)::numeric as total_costs,
          COALESCE(SUM(trade_pnl) FILTER (WHERE trade_pnl > 0), 0)::numeric as total_gross_wins,
          COALESCE(ABS(SUM(trade_pnl) FILTER (WHERE trade_pnl < 0)), 0)::numeric as total_gross_losses,
          ${useMedian
            ? 'COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY avg_return_pct) FILTER (WHERE avg_return_pct IS NOT NULL), 0)::numeric as avg_return_pct'
            : 'COALESCE(AVG(avg_return_pct) FILTER (WHERE avg_return_pct IS NOT NULL), 0)::numeric as avg_return_pct'
          },
          ${useMedian
            ? 'COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY r_value) FILTER (WHERE r_value IS NOT NULL), 0)::numeric as avg_r_value'
            : 'COALESCE(AVG(r_value) FILTER (WHERE r_value IS NOT NULL), 0)::numeric as avg_r_value'
          },
          COALESCE(STDDEV(trade_pnl), 0)::numeric as pnl_stddev,
          COUNT(DISTINCT symbol)::integer as symbols_traded,
          COUNT(DISTINCT first_trade_date)::integer as trading_days,
          COALESCE(SUM(execution_count), 0)::integer as total_executions
        FROM completed_trades
      ),
      daily_pnl AS (
        SELECT 
          first_trade_date as trade_date,
          SUM(trade_pnl) as daily_pnl,
          SUM(SUM(trade_pnl)) OVER (ORDER BY first_trade_date) as cumulative_pnl,
          COUNT(*) as trade_count
        FROM completed_trades
        GROUP BY first_trade_date
        ORDER BY first_trade_date
      ),
      drawdown_calc AS (
        SELECT 
          trade_date,
          cumulative_pnl,
          MAX(cumulative_pnl) OVER (ORDER BY trade_date ROWS UNBOUNDED PRECEDING) as peak,
          cumulative_pnl - MAX(cumulative_pnl) OVER (ORDER BY trade_date ROWS UNBOUNDED PRECEDING) as drawdown
        FROM daily_pnl
      ),
      drawdown_debug AS (
        SELECT 
          MIN(drawdown) as calculated_max_drawdown,
          COUNT(*) as drawdown_days,
          MIN(cumulative_pnl) as min_cumulative_pnl,
          MAX(peak) as max_peak
        FROM drawdown_calc
      ),
      individual_trades AS (
        -- Get best/worst individual executions, not round-trip aggregates
        SELECT 
          COALESCE(MAX(pnl), 0) as individual_best_trade,
          COALESCE(MIN(pnl), 0) as individual_worst_trade
        FROM trades t
        ${whereClause}
          AND pnl IS NOT NULL
      )
      SELECT 
        ts.*,
        COALESCE(dp.max_daily_gain, 0) as max_daily_gain,
        COALESCE(dp.max_daily_loss, 0) as max_daily_loss,
        COALESCE(dd.max_drawdown, 0) as max_drawdown,
        ddb.calculated_max_drawdown as debug_max_drawdown,
        ddb.drawdown_days,
        ddb.min_cumulative_pnl,
        ddb.max_peak,
        -- Override best/worst trade with individual execution values
        COALESCE(it.individual_best_trade, ts.best_trade) as best_trade,
        COALESCE(it.individual_worst_trade, ts.worst_trade) as worst_trade,
        CASE 
          WHEN ts.total_gross_losses = 0 OR ts.total_gross_losses IS NULL THEN 
            CASE WHEN ts.total_gross_wins > 0 THEN 999.99 ELSE 0 END
          ELSE ABS(ts.total_gross_wins / ts.total_gross_losses)
        END as profit_factor,
        CASE 
          WHEN ts.total_trades = 0 THEN 0
          ELSE (ts.winning_trades * 100.0 / ts.total_trades)
        END as win_rate,
        CASE 
          WHEN ts.pnl_stddev = 0 OR ts.pnl_stddev IS NULL THEN 0
          ELSE (ts.avg_pnl / ts.pnl_stddev)
        END as sharpe_ratio
      FROM trade_stats ts
      LEFT JOIN (
        SELECT 
          MAX(daily_pnl) as max_daily_gain,
          MIN(daily_pnl) as max_daily_loss
        FROM daily_pnl
      ) dp ON true
      LEFT JOIN (
        SELECT 
          MIN(drawdown) as max_drawdown,
          COUNT(*) as dd_count
        FROM drawdown_calc
      ) dd ON true
      LEFT JOIN drawdown_debug ddb ON true
      LEFT JOIN individual_trades it ON true
    `;

    const analyticsResult = await db.query(analyticsQuery, values);
    const analytics = analyticsResult.rows[0];
    
    console.log('Analytics main query result:', analytics);
    console.log(`Executions: ${executionCount}, Trades: ${analytics.total_trades}, Win Rate: ${parseFloat(analytics.win_rate || 0).toFixed(2)}%`);
    console.log('Analytics: Summary stats calculated:', {
      totalTrades: analytics.total_trades,
      winningTrades: analytics.winning_trades,
      losingTrades: analytics.losing_trades,
      totalPnL: analytics.total_pnl,
      avgRValue: analytics.avg_r_value
    });
    console.log('Drawdown debug info:', {
      max_drawdown: analytics.max_drawdown,
      debug_max_drawdown: analytics.debug_max_drawdown,
      drawdown_days: analytics.drawdown_days,
      min_cumulative_pnl: analytics.min_cumulative_pnl,
      max_peak: analytics.max_peak,
      dd_count: analytics.dd_count
    });
    
    // Debug: Get first few days of drawdown data
    const drawdownSampleQuery = `
      WITH daily_pnl AS (
        SELECT 
          trade_date,
          COALESCE(SUM(pnl), 0) as daily_pnl
        FROM trades
        WHERE user_id = $1
        GROUP BY trade_date
        ORDER BY trade_date
      ),
      cumulative_pnl AS (
        SELECT 
          trade_date,
          daily_pnl,
          SUM(daily_pnl) OVER (ORDER BY trade_date) as cumulative_pnl
        FROM daily_pnl
      ),
      drawdown_calc AS (
        SELECT 
          trade_date,
          daily_pnl,
          cumulative_pnl,
          MAX(cumulative_pnl) OVER (ORDER BY trade_date ROWS UNBOUNDED PRECEDING) as peak,
          cumulative_pnl - MAX(cumulative_pnl) OVER (ORDER BY trade_date ROWS UNBOUNDED PRECEDING) as drawdown
        FROM cumulative_pnl
      )
      SELECT * FROM drawdown_calc
      ORDER BY drawdown ASC
      LIMIT 5
    `;
    
    const drawdownSample = await db.query(drawdownSampleQuery, [userId]);
    console.log('Worst drawdown days:', drawdownSample.rows);

    // Get performance by symbol using simple grouping
    const symbolQuery = `
      WITH symbol_trades AS (
        SELECT 
          symbol,
          trade_date,
          SUM(COALESCE(pnl, 0)) as trade_pnl,
          SUM(quantity) as trade_volume,
          COUNT(*) as execution_count,
          CASE WHEN SUM(pnl) IS NOT NULL THEN 1 ELSE 0 END as is_completed
        FROM trades t
        ${whereClause}
        GROUP BY symbol, trade_date
      )
      SELECT 
        symbol,
        COUNT(*) FILTER (WHERE is_completed = 1) as trades,
        SUM(trade_pnl) as total_pnl,
        AVG(trade_pnl) FILTER (WHERE is_completed = 1) as avg_pnl,
        COUNT(*) FILTER (WHERE is_completed = 1 AND trade_pnl > 0) as wins,
        SUM(trade_volume) as total_volume
      FROM symbol_trades
      GROUP BY symbol
      ORDER BY total_pnl DESC
      LIMIT 10
    `;

    const symbolResult = await db.query(symbolQuery, values);

    // Get daily P&L for charting - simplified to work with any data
    const dailyPnLQuery = `
      SELECT 
        trade_date,
        SUM(COALESCE(pnl, 0)) as daily_pnl,
        SUM(SUM(COALESCE(pnl, 0))) OVER (ORDER BY trade_date) as cumulative_pnl,
        COUNT(*) as trade_count
      FROM trades t
      ${whereClause}
      GROUP BY trade_date
      HAVING COUNT(*) > 0
      ORDER BY trade_date
    `;

    const dailyPnLResult = await db.query(dailyPnLQuery, values);
    console.log('Analytics: Daily P&L query returned', dailyPnLResult.rows.length, 'rows');
    console.log('Analytics: Daily P&L sample data:', dailyPnLResult.rows.slice(0, 3));

    // Get daily win rate data - simplified
    const dailyWinRateQuery = `
      SELECT 
        trade_date,
        COUNT(*) FILTER (WHERE COALESCE(pnl, 0) > 0) as wins,
        COUNT(*) FILTER (WHERE COALESCE(pnl, 0) < 0) as losses,
        COUNT(*) FILTER (WHERE COALESCE(pnl, 0) = 0) as breakeven,
        COUNT(*) as total_trades,
        CASE 
          WHEN COUNT(*) > 0 THEN ROUND((COUNT(*) FILTER (WHERE COALESCE(pnl, 0) > 0)::decimal / COUNT(*)::decimal) * 100, 2)
          ELSE 0 
        END as win_rate
      FROM trades t
      ${whereClause}
      GROUP BY trade_date
      HAVING COUNT(*) > 0
      ORDER BY trade_date
    `;

    const dailyWinRateResult = await db.query(dailyWinRateQuery, values);
    console.log('Analytics: Daily win rate query returned', dailyWinRateResult.rows.length, 'rows');
    console.log('Analytics: Daily win rate sample data:', dailyWinRateResult.rows.slice(0, 3));

    // Get best and worst individual trades (not grouped)
    const topTradesQuery = `
      (
        SELECT 'best' as type, id, symbol, entry_price, exit_price, 
               quantity, pnl, trade_date
        FROM trades t
        ${whereClause} AND pnl IS NOT NULL AND pnl > 0
        ORDER BY pnl DESC
        LIMIT 5
      )
      UNION ALL
      (
        SELECT 'worst' as type, id, symbol, entry_price, exit_price, 
               quantity, pnl, trade_date
        FROM trades t
        ${whereClause} AND pnl IS NOT NULL AND pnl < 0
        ORDER BY pnl ASC
        LIMIT 5
      )
    `;

    const topTradesResult = await db.query(topTradesQuery, values);

    // Get individual best and worst trades for the metric cards
    const bestWorstTradesQuery = `
      (
        SELECT 'best' as type, id, symbol, pnl, trade_date
        FROM trades t
        ${whereClause} AND pnl IS NOT NULL AND pnl > 0
        ORDER BY pnl DESC
        LIMIT 1
      )
      UNION ALL
      (
        SELECT 'worst' as type, id, symbol, pnl, trade_date
        FROM trades t
        ${whereClause} AND pnl IS NOT NULL AND pnl < 0
        ORDER BY pnl ASC
        LIMIT 1
      )
    `;

    const bestWorstResult = await db.query(bestWorstTradesQuery, values);
    const bestTrade = bestWorstResult.rows.find(t => t.type === 'best') || null;
    const worstTrade = bestWorstResult.rows.find(t => t.type === 'worst') || null;

    return {
      summary: {
        totalTrades: parseInt(analytics.total_trades) || 0,
        totalExecutions: executionCount,
        winningTrades: parseInt(analytics.winning_trades) || 0,
        losingTrades: parseInt(analytics.losing_trades) || 0,
        breakevenTrades: parseInt(analytics.breakeven_trades) || 0,
        totalPnL: parseFloat(analytics.total_pnl) || 0,
        avgPnL: parseFloat(analytics.avg_pnl) || 0,
        avgWin: parseFloat(analytics.avg_win) || 0,
        avgLoss: parseFloat(analytics.avg_loss) || 0,
        bestTrade: parseFloat(analytics.best_trade) || 0,
        worstTrade: parseFloat(analytics.worst_trade) || 0,
        totalCosts: parseFloat(analytics.total_costs) || 0,
        winRate: parseFloat(analytics.win_rate) || 0,
        profitFactor: parseFloat(analytics.profit_factor) || 0,
        sharpeRatio: parseFloat(analytics.sharpe_ratio) || 0,
        maxDrawdown: parseFloat(analytics.max_drawdown) || 0,
        maxDailyGain: parseFloat(analytics.max_daily_gain) || 0,
        maxDailyLoss: parseFloat(analytics.max_daily_loss) || 0,
        symbolsTraded: parseInt(analytics.symbols_traded) || 0,
        tradingDays: parseInt(analytics.trading_days) || 0,
        avgReturnPercent: parseFloat(analytics.avg_return_pct) || 0,
        avgRValue: parseFloat(analytics.avg_r_value) || 0
      },
      performanceBySymbol: symbolResult.rows,
      dailyPnL: dailyPnLResult.rows,
      dailyWinRate: dailyWinRateResult.rows,
      topTrades: {
        best: topTradesResult.rows.filter(t => t.type === 'best'),
        worst: topTradesResult.rows.filter(t => t.type === 'worst')
      },
      bestTradeDetails: bestTrade,
      worstTradeDetails: worstTrade
    };
  }

  static async getSymbolList(userId) {
    const query = `
      SELECT DISTINCT symbol
      FROM trades
      WHERE user_id = $1
      ORDER BY symbol
    `;
    const result = await db.query(query, [userId]);
    return result.rows.map(row => row.symbol);
  }

  static async getStrategyList(userId) {
    const query = `
      SELECT DISTINCT strategy
      FROM trades
      WHERE user_id = $1 AND strategy IS NOT NULL AND strategy != ''
      ORDER BY strategy
    `;
    const result = await db.query(query, [userId]);
    return result.rows.map(row => row.strategy);
  }

  static async getSetupList(userId) {
    const query = `
      SELECT DISTINCT setup
      FROM trades
      WHERE user_id = $1 AND setup IS NOT NULL AND setup != ''
      ORDER BY setup
    `;
    const result = await db.query(query, [userId]);
    return result.rows.map(row => row.setup);
  }

  static async getBrokerList(userId) {
    const query = `
      SELECT DISTINCT broker
      FROM trades
      WHERE user_id = $1 AND broker IS NOT NULL AND broker != ''
      ORDER BY broker
    `;
    const result = await db.query(query, [userId]);
    return result.rows.map(row => row.broker);
  }

  // Create a new round trip trade record
  static async createRoundTrip(userId, roundTripData) {
    const {
      symbol, entry_time, exit_time, entry_price, exit_price,
      total_quantity, side, strategy, notes
    } = roundTripData;

    // Calculate P&L and commission totals
    const total_pnl = this.calculatePnL(entry_price, exit_price, total_quantity, side);
    const pnl_percent = this.calculatePnLPercent(entry_price, exit_price, side);
    const is_completed = !!exit_time && !!exit_price;

    const query = `
      INSERT INTO round_trip_trades (
        user_id, symbol, entry_time, exit_time, entry_price, exit_price,
        total_quantity, total_pnl, pnl_percent, side, strategy, notes, is_completed
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const values = [
      userId, symbol.toUpperCase(), entry_time, exit_time, entry_price, exit_price,
      total_quantity, total_pnl, pnl_percent, side, strategy, notes, is_completed
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Update a round trip trade record
  static async updateRoundTrip(roundTripId, userId, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Handle allowed updates
    const allowedFields = [
      'exit_time', 'exit_price', 'total_quantity', 'strategy', 'notes'
    ];

    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        fields.push(`${field} = $${paramCount}`);
        values.push(updates[field]);
        paramCount++;
      }
    });

    // Recalculate P&L if prices/quantity changed
    if (updates.exit_price !== undefined || updates.total_quantity !== undefined) {
      // Get current round trip data to calculate P&L
      const currentData = await this.findRoundTripById(roundTripId, userId);
      if (currentData) {
        const entry_price = currentData.entry_price;
        const exit_price = updates.exit_price !== undefined ? updates.exit_price : currentData.exit_price;
        const quantity = updates.total_quantity !== undefined ? updates.total_quantity : currentData.quantity;
        const side = currentData.side;

        if (exit_price) {
          const total_pnl = this.calculatePnL(entry_price, exit_price, quantity, side);
          const pnl_percent = this.calculatePnLPercent(entry_price, exit_price, side);
          
          fields.push(`total_pnl = $${paramCount}`);
          values.push(total_pnl);
          paramCount++;
          
          fields.push(`pnl_percent = $${paramCount}`);
          values.push(pnl_percent);
          paramCount++;
          
          fields.push(`is_completed = $${paramCount}`);
          values.push(true);
          paramCount++;
        }
      }
    }

    if (fields.length === 0) {
      return null; // No updates to apply
    }

    values.push(roundTripId);
    values.push(userId);

    const query = `
      UPDATE round_trip_trades
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  // Link individual trades to a round trip
  static async linkTradesToRoundTrip(roundTripId, tradeIds) {
    const query = `
      UPDATE trades
      SET round_trip_id = $1
      WHERE id = ANY($2)
      RETURNING id
    `;

    const result = await db.query(query, [roundTripId, tradeIds]);
    return result.rows.map(row => row.id);
  }

  static async updateSymbolForCusip(userId, cusip, ticker) {
    const query = `
      UPDATE trades 
      SET symbol = $3
      WHERE user_id = $1 AND symbol = $2
    `;
    const result = await db.query(query, [userId, cusip, ticker]);
    console.log(`Updated ${result.rowCount} trades: changed symbol from ${cusip} to ${ticker}`);
    return { affectedRows: result.rowCount };
  }

  static async getRoundTripTradeCount(userId, filters = {}) {
    const { getUserTimezone } = require('../utils/timezone');
    // Build WHERE clause for round_trip_trades table
    let whereClause = 'WHERE user_id = $1';
    const values = [userId];
    let paramCount = 2;

    if (filters.symbol) {
      whereClause += ` AND symbol ILIKE $${paramCount} || '%'`;
      values.push(filters.symbol.toUpperCase());
      paramCount++;
    }

    if (filters.startDate) {
      whereClause += ` AND DATE(entry_time) >= $${paramCount}`;
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      whereClause += ` AND DATE(entry_time) <= $${paramCount}`;
      values.push(filters.endDate);
      paramCount++;
    }

    // Multi-select strategies filter for round-trip trade count
    if (filters.strategies && filters.strategies.length > 0) {
      const placeholders = filters.strategies.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND strategy IN (${placeholders})`;
      filters.strategies.forEach(strategy => values.push(strategy));
      paramCount += filters.strategies.length;
    } else if (filters.strategy) {
      whereClause += ` AND strategy = $${paramCount}`;
      values.push(filters.strategy);
      paramCount++;
    }

    // Days of week filter for round-trip trade count (timezone-aware)
    if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
      const userTimezone = await getUserTimezone(userId);
      const placeholders = filters.daysOfWeek.map((_, index) => `$${paramCount + index}`).join(',');
      
      if (userTimezone !== 'UTC') {
        whereClause += ` AND extract(dow from (entry_time AT TIME ZONE 'UTC' AT TIME ZONE $${paramCount + filters.daysOfWeek.length})) IN (${placeholders})`;
        filters.daysOfWeek.forEach(dayNum => values.push(dayNum));
        values.push(userTimezone);
        paramCount += filters.daysOfWeek.length + 1;
      } else {
        whereClause += ` AND extract(dow from entry_time) IN (${placeholders})`;
        filters.daysOfWeek.forEach(dayNum => values.push(dayNum));
        paramCount += filters.daysOfWeek.length;
      }
    }

    const query = `
      SELECT COUNT(*)::integer as round_trip_count
      FROM round_trip_trades
      ${whereClause}
    `;

    const result = await db.query(query, values);
    return parseInt(result.rows[0].round_trip_count) || 0;
  }

  static async getRoundTripTrades(userId, filters = {}) {
    const { getUserTimezone } = require('../utils/timezone');
    // Build WHERE clause for round_trip_trades table
    let whereClause = 'WHERE rt.user_id = $1';
    const values = [userId];
    let paramCount = 2;

    if (filters.symbol) {
      whereClause += ` AND rt.symbol ILIKE $${paramCount} || '%'`;
      values.push(filters.symbol.toUpperCase());
      paramCount++;
    }

    if (filters.startDate) {
      whereClause += ` AND DATE(rt.entry_time) >= $${paramCount}`;
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      whereClause += ` AND DATE(rt.entry_time) <= $${paramCount}`;
      values.push(filters.endDate);
      paramCount++;
    }

    // Multi-select strategies filter for round-trip trades
    if (filters.strategies && filters.strategies.length > 0) {
      const placeholders = filters.strategies.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND rt.strategy IN (${placeholders})`;
      filters.strategies.forEach(strategy => values.push(strategy));
      paramCount += filters.strategies.length;
    } else if (filters.strategy) {
      whereClause += ` AND rt.strategy = $${paramCount}`;
      values.push(filters.strategy);
      paramCount++;
    }

    // Multi-select sectors filter for round-trip trades
    if (filters.sectors && filters.sectors.length > 0) {
      const placeholders = filters.sectors.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND sc.finnhub_industry IN (${placeholders})`;
      filters.sectors.forEach(sector => values.push(sector));
      paramCount += filters.sectors.length;
    }

    // Days of week filter for round-trip trades (timezone-aware)
    if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
      const userTimezone = await getUserTimezone(userId);
      const placeholders = filters.daysOfWeek.map((_, index) => `$${paramCount + index}`).join(',');
      
      if (userTimezone !== 'UTC') {
        whereClause += ` AND extract(dow from (rt.entry_time AT TIME ZONE 'UTC' AT TIME ZONE $${paramCount + filters.daysOfWeek.length})) IN (${placeholders})`;
        filters.daysOfWeek.forEach(dayNum => values.push(dayNum));
        values.push(userTimezone);
        paramCount += filters.daysOfWeek.length + 1;
      } else {
        whereClause += ` AND extract(dow from rt.entry_time) IN (${placeholders})`;
        filters.daysOfWeek.forEach(dayNum => values.push(dayNum));
        paramCount += filters.daysOfWeek.length;
      }
    }

    // Add pagination
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    const query = `
      SELECT 
        rt.*,
        sc.finnhub_industry as sector,
        COUNT(t.id) as execution_count,
        DATE(rt.entry_time) as trade_date
      FROM round_trip_trades rt
      LEFT JOIN symbol_categories sc ON rt.symbol = sc.symbol
      LEFT JOIN trades t ON rt.id = t.round_trip_id
      ${whereClause}
      GROUP BY rt.id, sc.finnhub_industry
      ORDER BY rt.entry_time DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    values.push(limit, offset);

    const result = await db.query(query, values);
    
    return result.rows.map(row => ({
      id: row.id,
      symbol: row.symbol,
      trade_date: row.trade_date,
      pnl: parseFloat(row.total_pnl) || 0,
      pnl_percent: parseFloat(row.pnl_percent) || 0,
      commission: parseFloat(row.total_commission) || 0,
      fees: parseFloat(row.total_fees) || 0,
      execution_count: parseInt(row.execution_count) || 0,
      entry_time: row.entry_time,
      exit_time: row.exit_time,
      entry_price: parseFloat(row.entry_price) || 0,
      exit_price: parseFloat(row.exit_price) || 0,
      quantity: parseFloat(row.total_quantity) || 0,
      side: row.side,
      strategy: row.strategy || '',
      broker: '',
      sector: row.sector || '',
      notes: row.notes || '',
      is_completed: row.is_completed,
      trade_type: 'round-trip',
      comment_count: 0
    }));
  }

  // Convert minHoldTime/maxHoldTime (in minutes) to holdTime range option
  static convertHoldTimeRange(minMinutes, maxMinutes) {
    // Handle specific strategy ranges first (more inclusive approach)
    if (maxMinutes <= 15) return '5-15 min' // Scalper: trades under 15 minutes
    if (maxMinutes <= 240) return '2-4 hours' // Momentum: up to 4 hours (more inclusive)
    if (maxMinutes <= 480) return '4-24 hours' // Mean reversion: up to 8 hours (more inclusive) 
    if (minMinutes >= 1440) return '1-7 days' // Swing: over 1 day
    
    // Fallback to exact mapping for edge cases
    if (maxMinutes < 1) return '< 1 min'
    if (maxMinutes <= 5) return '1-5 min'
    if (maxMinutes <= 30) return '15-30 min'
    if (maxMinutes <= 60) return '30-60 min'
    if (maxMinutes <= 120) return '1-2 hours'
    if (maxMinutes <= 1440) return '4-24 hours'
    if (maxMinutes <= 10080) return '1-7 days'
    if (maxMinutes <= 40320) return '1-4 weeks'
    
    return '1+ months' // Default for very long trades
  }

  static getHoldTimeFilter(holdTimeRange) {
    // Calculate hold time as the difference between entry_time and exit_time
    // For open trades (no exit_time), use current time
    let timeCondition = '';
    
    switch (holdTimeRange) {
      case '< 1 min':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) < 60`;
        break;
      case '1-5 min':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 60 AND 300`;
        break;
      case '5-15 min':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 300 AND 900`;
        break;
      case '15-30 min':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 900 AND 1800`;
        break;
      case '30-60 min':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 1800 AND 3600`;
        break;
      case '1-2 hours':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 3600 AND 7200`;
        break;
      case '2-4 hours':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 7200 AND 14400`;
        break;
      case '4-24 hours':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 14400 AND 86400`;
        break;
      case '1-7 days':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 86400 AND 604800`;
        break;
      case '1-4 weeks':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 604800 AND 2419200`;
        break;
      case '1+ months':
        timeCondition = ` AND EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) >= 2419200`;
        break;
      default:
        timeCondition = '';
    }
    
    return timeCondition;
  }

  // Classify individual trades by strategy using technical analysis (basic fallback version)
  static classifyTradeStrategy(trade) {
    const holdTimeMinutes = parseFloat(trade.hold_time_minutes || 0);
    const pnl = parseFloat(trade.pnl || 0);
    const quantity = parseFloat(trade.quantity || 0);
    
    // Strategy classification based on hold time (primary factor) - this is a fallback
    // The real classification should use classifyTradeStrategyWithAnalysis for accurate results
    if (holdTimeMinutes < 15) {
      return 'scalper'; // Ultra-short term trades
    } else if (holdTimeMinutes < 240) { // < 4 hours
      // Secondary classification for short-term trades
      if (pnl > 0 && holdTimeMinutes < 60) {
        return 'momentum'; // Quick profitable trades suggest momentum
      } else {
        return 'day_trading'; // Other short-term trades
      }
    } else if (holdTimeMinutes < 480) { // 4-8 hours
      return 'momentum'; // Medium-term momentum/breakout trades
    } else if (holdTimeMinutes < 1440) { // < 1 day
      return 'mean_reversion'; // Intraday mean reversion
    } else if (holdTimeMinutes < 10080) { // < 1 week
      return 'swing'; // Multi-day swing trades
    } else {
      return 'position'; // Long-term position trades
    }
  }

  // Enhanced strategy classification using Finnhub technical analysis
  static async classifyTradeStrategyWithAnalysis(trade, userId = null) {
    const finnhub = require('../utils/finnhub');
    
    if (!finnhub.isConfigured()) {
      return this.classifyTradeStrategy(trade);
    }

    // Circuit breaker: if Finnhub has been failing frequently, skip API calls
    const circuitBreakerKey = 'finnhub_circuit_breaker';
    const cache = require('../utils/cache');
    
    try {
      const circuitBreakerData = await cache.get(circuitBreakerKey);
      if (circuitBreakerData && circuitBreakerData.failures >= 10) {
        console.log(`Circuit breaker OPEN: Skipping Finnhub API calls due to ${circuitBreakerData.failures} recent failures`);
        return {
          strategy: this.classifyTradeStrategy(trade),
          confidence: 0.6,
          method: 'circuit_breaker_fallback',
          signals: [],
          analysisType: 'time_based_due_to_api_failures'
        };
      }
    } catch (cacheError) {
      // Ignore cache errors, continue with normal processing
    }

    try {
      const holdTimeMinutes = parseFloat(trade.hold_time_minutes || 0);
      const pnl = Math.abs(parseFloat(trade.pnl || 0));
      const quantity = parseFloat(trade.quantity || 0);
      const value = quantity * parseFloat(trade.entry_price || 0);

      // Fast path: Skip expensive API calls for small/simple trades
      // Only do full technical analysis for significant trades
      const isSignificantTrade = value > 1000 || pnl > 50 || holdTimeMinutes > 1440; // $1000+ value, $50+ P&L, or 1+ day hold
      
      if (!isSignificantTrade) {
        console.log(`Fast classification for small trade ${trade.id}: $${value.toFixed(2)} value, ${holdTimeMinutes}min hold`);
        return {
          strategy: this.classifyTradeStrategy(trade),
          confidence: 0.7,
          method: 'fast_path',
          signals: [],
          holdTimeMinutes,
          analysisType: 'time_based_optimized'
        };
      }

      const symbol = trade.symbol;
      const entryTime = new Date(trade.entry_time);
      const exitTime = trade.exit_time ? new Date(trade.exit_time) : new Date();
      const entryPrice = parseFloat(trade.entry_price);
      const exitPrice = parseFloat(trade.exit_price);

      // Get price data around the trade period (minimal range for performance)
      const entryTimestamp = Math.floor(entryTime.getTime() / 1000);
      const exitTimestamp = Math.floor(exitTime.getTime() / 1000);
      
      // Reduced analysis window for performance
      const analysisStart = entryTimestamp - (12 * 60 * 60); // 12 hours before (was 24)
      const analysisEnd = exitTimestamp + (6 * 60 * 60); // 6 hours after (was 24)

      // Only fetch candles (skip expensive technical indicators for performance)
      console.log(`Full classification for significant trade ${trade.id}: $${value.toFixed(2)} value`);
      
      const candles = await finnhub.getCandles(symbol, '60', analysisStart, analysisEnd, userId).catch(() => null);

      // Skip news data and technical indicators for performance
      // Analyze the trade based on basic price movement
      const analysis = this.analyzeTradeCharacteristics({
        trade,
        patterns: null,
        candles,
        technicalData: null, // Skip for performance
        entryTimestamp,
        exitTimestamp,
        newsData: null // Skip for performance
      });

      // Record successful API call for circuit breaker
      try {
        await cache.set(circuitBreakerKey, { failures: 0, lastSuccess: Date.now() }, 3600); // Reset failures on success
      } catch (cacheError) {
        // Ignore cache errors
      }

      return analysis.strategy;

    } catch (error) {
      console.error(`Error analyzing trade ${trade.id} for strategy classification:`, error);
      
      // Record failure for circuit breaker
      try {
        const circuitBreakerData = await cache.get(circuitBreakerKey) || { failures: 0 };
        circuitBreakerData.failures = (circuitBreakerData.failures || 0) + 1;
        circuitBreakerData.lastFailure = Date.now();
        await cache.set(circuitBreakerKey, circuitBreakerData, 3600); // Store for 1 hour
        
        if (circuitBreakerData.failures >= 10) {
          console.log(`[ERROR] Circuit breaker OPENED: ${circuitBreakerData.failures} Finnhub failures`);
        }
      } catch (cacheError) {
        // Ignore cache errors
      }
      
      return this.classifyTradeStrategy(trade); // Fallback to time-based
    }
  }

  // Get relevant technical indicators for trade analysis
  static async getTechnicalIndicators(symbol, entryTimestamp, exitTimestamp, userId = null) {
    const finnhub = require('../utils/finnhub');
    
    // Calculate intelligent date range to avoid "increase from and to range" errors
    const tradeStart = entryTimestamp;
    const tradeEnd = exitTimestamp || entryTimestamp;
    const tradeDurationDays = (tradeEnd - tradeStart) / (24 * 60 * 60);
    
    // Use adaptive range based on trade duration and technical indicator requirements
    // RSI needs 14+ periods, MACD needs 26+ periods, BBands needs 20+ periods
    // Use 5-minute resolution for more data points
    let analysisStart, analysisEnd, resolution;
    
    if (tradeDurationDays < 1) {
      // Short trades: use minimal data for quick analysis
      // RSI-14 needs ~3-4x periods for stability: 14 periods × 4 = 56 periods minimum
      // At 60-minute resolution: 56 hours = ~2.3 days minimum
      analysisStart = tradeStart - (7 * 24 * 60 * 60); // 7 days before (168 hours = 168 periods)
      analysisEnd = tradeEnd + (1 * 24 * 60 * 60); // 1 day after
      resolution = '60'; // 60-minute bars
    } else if (tradeDurationDays < 7) {
      // Medium trades: use daily data for better stability
      analysisStart = tradeStart - (30 * 24 * 60 * 60); // 30 days before
      analysisEnd = tradeEnd + (5 * 24 * 60 * 60); // 5 days after
      resolution = 'D'; // Daily bars
    } else {
      // Long trades: use daily data with more history
      analysisStart = tradeStart - (60 * 24 * 60 * 60); // 60 days before
      analysisEnd = tradeEnd + (7 * 24 * 60 * 60); // 7 days after
      resolution = 'D'; // Daily bars
    }

    try {
      console.log(`Fetching technical indicators for ${symbol}: ${new Date(analysisStart * 1000).toISOString()} to ${new Date(analysisEnd * 1000).toISOString()} (${resolution}min resolution)`);
      
      // Fetch indicators with adaptive parameters
      const indicators = {};
      
      // RSI - most reliable indicator
      // Skip RSI for known problematic symbols that consistently fail
      const problematicSymbols = ['AAPL', 'ORIS']; // Add symbols that consistently fail
      if (problematicSymbols.includes(symbol)) {
        console.warn(`Skipping RSI for known problematic symbol: ${symbol}`);
        indicators.rsi = null;
      } else {
        try {
          indicators.rsi = await finnhub.getTechnicalIndicator(symbol, resolution, analysisStart, analysisEnd, 'rsi', { timeperiod: 14 });
        } catch (error) {
          console.warn(`RSI failed for ${symbol}: ${error.message}`);
          
          // Try one simple fallback: daily data with minimal range
          if (error.message.includes('Timeperiod is too long') || error.message.includes('422')) {
            try {
              // Minimal approach: 30 days of daily data only
              console.warn(`Retrying RSI for ${symbol} with minimal daily data`);
              const minimalStart = tradeStart - (30 * 24 * 60 * 60); // 30 days only
              const minimalEnd = tradeEnd; // No extra days after
              indicators.rsi = await finnhub.getTechnicalIndicator(symbol, 'D', minimalStart, minimalEnd, 'rsi', { timeperiod: 14 });
            } catch (minimalError) {
              console.warn(`RSI minimal fallback failed for ${symbol}, adding to problematic symbols list: ${minimalError.message}`);
              indicators.rsi = null;
            }
          } else {
            indicators.rsi = null;
          }
        }
      }
      
      // MACD - requires more data
      try {
        indicators.macd = await finnhub.getTechnicalIndicator(symbol, resolution, analysisStart, analysisEnd, 'macd', { 
          fastperiod: 12, slowperiod: 26, signalperiod: 9 
        });
      } catch (error) {
        console.warn(`MACD failed for ${symbol}: ${error.message}`);
        
        // Skip MACD on this error since it requires even more data than RSI
        console.warn(`Skipping MACD for ${symbol} due to data range limitations`);
        indicators.macd = null;
      }
      
      // Bollinger Bands - also requires significant data
      try {
        indicators.bbands = await finnhub.getTechnicalIndicator(symbol, resolution, analysisStart, analysisEnd, 'bbands', { 
          timeperiod: 20, nbdevup: 2, nbdevdn: 2 
        });
      } catch (error) {
        console.warn(`BBands failed for ${symbol}: ${error.message}`);
        
        // Try fallback with shorter BBands period
        if (error.message.includes('Timeperiod is too long') || error.message.includes('422')) {
          try {
            // Fallback: Use shorter BBands period (10 instead of 20) with daily resolution
            console.warn(`Retrying BBands for ${symbol} with shorter period (10) and daily resolution`);
            const dailyStart = Math.floor((tradeStart - (30 * 24 * 60 * 60)) / (24 * 60 * 60)) * 24 * 60 * 60; // 30 days for BBands-10
            const dailyEnd = Math.floor((tradeEnd + (3 * 24 * 60 * 60)) / (24 * 60 * 60)) * 24 * 60 * 60; // 3 days after
            indicators.bbands = await finnhub.getTechnicalIndicator(symbol, 'D', dailyStart, dailyEnd, 'bbands', { 
              timeperiod: 10, nbdevup: 2, nbdevdn: 2 
            });
          } catch (fallbackError) {
            console.warn(`BBands fallback failed for ${symbol}: ${fallbackError.message}`);
            indicators.bbands = null;
          }
        } else {
          indicators.bbands = null;
        }
      }

      // Return indicators with null placeholders for unused ones
      return { 
        ...indicators,
        sma: null, 
        ema: null, 
        adx: null, 
        stoch: null 
      };
    } catch (error) {
      console.error('Error fetching technical indicators:', error);
      return null;
    }
  }

  // Analyze trade characteristics to determine strategy
  static analyzeTradeCharacteristics({ trade, patterns, candles, technicalData, entryTimestamp, exitTimestamp, newsData = null }) {
    const holdTimeMinutes = parseFloat(trade.hold_time_minutes || 0);
    const pnl = parseFloat(trade.pnl || 0);
    const entryPrice = parseFloat(trade.entry_price);
    const exitPrice = parseFloat(trade.exit_price);
    const side = trade.side;
    const priceMove = side === 'long' ? (exitPrice - entryPrice) / entryPrice : (entryPrice - exitPrice) / entryPrice;

    let strategy = 'day_trading'; // Default
    let confidence = 0.5;
    const signals = [];

    // Time-based initial classification
    if (holdTimeMinutes < 15) {
      strategy = 'scalper';
      confidence = 0.8;
    } else if (holdTimeMinutes > 1440) {
      strategy = 'swing';
      confidence = 0.7;
    }

    // Skip pattern analysis - removed per user request to use only technical indicators

    // Enhanced technical indicator analysis with comprehensive indicators
    if (technicalData) {
      const rsiSignals = this.analyzeRSI(technicalData.rsi, entryTimestamp, exitTimestamp);
      const macdSignals = this.analyzeMACD(technicalData.macd, entryTimestamp, exitTimestamp);
      
      if (rsiSignals.indicates === 'momentum') {
        strategy = 'momentum';
        confidence = Math.max(confidence, 0.75);
        signals.push('RSI momentum signals');
      } else if (rsiSignals.indicates === 'mean_reversion') {
        strategy = 'mean_reversion';
        confidence = Math.max(confidence, 0.8);
        signals.push('RSI oversold/overbought signals');
      }

      if (macdSignals.indicates === 'momentum') {
        if (strategy !== 'mean_reversion') { // Don't override strong mean reversion signals
          strategy = 'momentum';
          confidence = Math.max(confidence, 0.8);
          signals.push('MACD momentum crossover');
        }
      }

      // Analyze Bollinger Bands for volatility breakouts or mean reversion
      if (technicalData.bbands) {
        const bbandAnalysis = this.analyzeBollingerBands(technicalData.bbands, entryTimestamp, exitTimestamp, side);
        if (bbandAnalysis.indicates === 'breakout') {
          strategy = 'momentum';
          confidence = Math.max(confidence, 0.85);
          signals.push('Bollinger Band breakout');
        } else if (bbandAnalysis.indicates === 'mean_reversion') {
          strategy = 'mean_reversion';
          confidence = Math.max(confidence, 0.8);
          signals.push('Bollinger Band touch and reversal');
        }
      }

      // Analyze ADX for trend strength
      if (technicalData.adx) {
        const adxAnalysis = this.analyzeADX(technicalData.adx, entryTimestamp);
        if (adxAnalysis.trendStrength === 'strong' && holdTimeMinutes < 480) {
          if (strategy !== 'mean_reversion') { // Strong trends favor momentum
            strategy = 'momentum';
            confidence = Math.max(confidence, 0.8);
            signals.push('Strong trend (ADX > 25)');
          }
        }
      }

      // Analyze Stochastic for overbought/oversold conditions
      if (technicalData.stoch) {
        const stochAnalysis = this.analyzeStochastic(technicalData.stoch, entryTimestamp, side);
        if (stochAnalysis.indicates === 'mean_reversion') {
          strategy = 'mean_reversion';
          confidence = Math.max(confidence, 0.75);
          signals.push('Stochastic oversold/overbought reversal');
        }
      }
    }

    // Price movement analysis
    if (Math.abs(priceMove) > 0.05 && holdTimeMinutes < 60) { // >5% move in <1 hour
      strategy = 'momentum';
      confidence = Math.max(confidence, 0.85);
      signals.push('Large quick price movement');
    }

    // News-driven trade analysis (Pro feature)
    if (newsData && newsData.hasNews && newsData.newsEvents.length > 0) {
      signals.push(`${newsData.newsEvents.length} news event(s) on trade date`);
      
      // Analyze news sentiment impact on strategy
      if (newsData.sentiment === 'positive' || newsData.sentiment === 'negative') {
        // News-driven trades often indicate momentum or event-driven strategies
        if (holdTimeMinutes < 240) { // Less than 4 hours
          if (Math.abs(priceMove) > 0.02) { // >2% move
            strategy = 'news_momentum';
            confidence = Math.max(confidence, 0.9);
            signals.push(`${newsData.sentiment} news drove price movement`);
          }
        } else if (holdTimeMinutes < 1440) { // Less than 1 day
          // Longer news-driven positions might be event-based swing trades
          strategy = 'news_swing';
          confidence = Math.max(confidence, 0.8);
          signals.push(`${newsData.sentiment} news influenced swing position`);
        }
      }
      
      // Mixed sentiment might indicate uncertainty-driven mean reversion
      if (newsData.sentiment === 'mixed' && Math.abs(priceMove) < 0.01) {
        strategy = 'news_uncertainty';
        confidence = Math.max(confidence, 0.7);
        signals.push('Mixed news sentiment led to range-bound trading');
      }
    }

    return {
      strategy,
      confidence: Math.round(confidence * 100) / 100,
      signals,
      holdTimeMinutes,
      priceMove: Math.round(priceMove * 10000) / 100 // As percentage
    };
  }

  // Pattern recognition methods removed - now using only technical indicators per user request

  // Technical indicator analysis helpers
  static analyzeRSI(rsiData, entryTime, exitTime) {
    if (!rsiData || !rsiData.rsi || rsiData.rsi.length === 0) {
      return { indicates: 'unknown' };
    }

    // Find RSI values around entry and exit
    const entryRSI = this.findIndicatorAtTime(rsiData, entryTime);
    const exitRSI = this.findIndicatorAtTime(rsiData, exitTime);

    if (entryRSI < 30 || exitRSI > 70) {
      return { indicates: 'mean_reversion', reason: 'RSI oversold/overbought levels' };
    } else if (entryRSI > 50 && exitRSI > entryRSI) {
      return { indicates: 'momentum', reason: 'RSI trending higher' };
    }

    return { indicates: 'neutral' };
  }

  static analyzeMACD(macdData, entryTime, exitTime) {
    if (!macdData || !macdData.macd || !macdData.signal) {
      return { indicates: 'unknown' };
    }

    const entryMACD = this.findIndicatorAtTime(macdData, entryTime);
    const entrySignal = this.findIndicatorAtTime({ signal: macdData.signal }, entryTime);

    if (entryMACD && entrySignal && entryMACD > entrySignal) {
      return { indicates: 'momentum', reason: 'MACD above signal line' };
    }

    return { indicates: 'neutral' };
  }

  static findIndicatorAtTime(indicatorData, targetTime) {
    if (!indicatorData.t || !indicatorData.t.length) return null;
    
    const targetTimestamp = Math.floor(targetTime);
    let closestIndex = 0;
    let closestDiff = Math.abs(indicatorData.t[0] - targetTimestamp);

    for (let i = 1; i < indicatorData.t.length; i++) {
      const diff = Math.abs(indicatorData.t[i] - targetTimestamp);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestIndex = i;
      }
    }

    // Return the main indicator value (RSI, MACD, etc.)
    const dataKeys = Object.keys(indicatorData).filter(key => key !== 't');
    if (dataKeys.length > 0) {
      return indicatorData[dataKeys[0]][closestIndex];
    }
    
    return null;
  }

  // Analyze Bollinger Bands for breakout or mean reversion
  static analyzeBollingerBands(bbandsData, entryTime, exitTime, side) {
    if (!bbandsData || !bbandsData.lower || !bbandsData.middle || !bbandsData.upper) {
      return { indicates: 'unknown' };
    }

    // Find values around entry
    const entryLower = this.findIndicatorAtTime(bbandsData.lower, entryTime);
    const entryMiddle = this.findIndicatorAtTime(bbandsData.middle, entryTime);
    const entryUpper = this.findIndicatorAtTime(bbandsData.upper, entryTime);

    // Simple analysis: if price near bands, it's either breakout or mean reversion
    // This is simplified - real implementation would check actual price vs bands
    const bandwidth = entryUpper - entryLower;
    const narrowBand = bandwidth < (entryMiddle * 0.02); // Band squeeze

    if (narrowBand) {
      return { indicates: 'breakout', reason: 'Bollinger Band squeeze' };
    }

    return { indicates: 'neutral' };
  }

  // Analyze ADX for trend strength
  static analyzeADX(adxData, entryTime) {
    if (!adxData || !adxData.adx) {
      return { trendStrength: 'unknown' };
    }

    const adxValue = this.findIndicatorAtTime(adxData, entryTime);
    
    if (adxValue > 25) {
      return { trendStrength: 'strong', value: adxValue };
    } else if (adxValue > 20) {
      return { trendStrength: 'moderate', value: adxValue };
    } else {
      return { trendStrength: 'weak', value: adxValue };
    }
  }

  // Analyze Stochastic for overbought/oversold
  static analyzeStochastic(stochData, entryTime, side) {
    if (!stochData || !stochData.k || !stochData.d) {
      return { indicates: 'unknown' };
    }

    const kValue = this.findIndicatorAtTime(stochData.k, entryTime);
    const dValue = this.findIndicatorAtTime(stochData.d, entryTime);

    if (side === 'long' && kValue < 20) {
      return { indicates: 'mean_reversion', reason: 'Stochastic oversold entry' };
    } else if (side === 'short' && kValue > 80) {
      return { indicates: 'mean_reversion', reason: 'Stochastic overbought entry' };
    }

    return { indicates: 'neutral' };
  }

  // Get strategy filter condition for SQL queries
  static getStrategyFilter(strategy) {
    if (!strategy) return '';

    // Map strategy to hold time ranges
    const strategyMappings = {
      'scalper': 'EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) < 900', // < 15 min
      'day_trading': 'EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 900 AND 14400', // 15min - 4hrs (excluding quick profitable momentum)
      'momentum': 'EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 900 AND 28800', // 15min - 8hrs
      'mean_reversion': 'EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 14400 AND 86400', // 4hrs - 1day
      'swing': 'EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 86400 AND 604800', // 1day - 1week
      'position': 'EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) >= 604800', // > 1 week
      'breakout': 'EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 900 AND 28800 AND t.pnl > 0', // Quick profitable trades
      'reversal': 'EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 14400 AND 86400', // Same as mean reversion
      'trend_following': 'EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 28800 AND 604800', // 8hrs - 1week
      'contrarian': 'EXTRACT(EPOCH FROM (COALESCE(t.exit_time, NOW()) - t.entry_time)) BETWEEN 14400 AND 86400' // Same as mean reversion
    };

    const condition = strategyMappings[strategy];
    return condition ? ` AND ${condition}` : '';
  }

  // Delete a round trip trade
  static async deleteRoundTrip(roundTripId, userId) {
    // First, unlink any associated trades
    await db.query('UPDATE trades SET round_trip_id = NULL WHERE round_trip_id = $1', [roundTripId]);
    
    // Then delete the round trip record
    const query = `
      DELETE FROM round_trip_trades
      WHERE id = $1 AND user_id = $2
      RETURNING id
    `;

    const result = await db.query(query, [roundTripId, userId]);
    return result.rows[0];
  }

  // Basic strategy classification for incomplete trades (no exit data)
  static async classifyTradeBasic(trade) {
    const entryTime = new Date(trade.entry_time);
    const exitTime = trade.exit_time ? new Date(trade.exit_time) : new Date();
    const holdTimeMinutes = trade.hold_time_minutes || ((exitTime - entryTime) / (1000 * 60));
    const quantity = parseFloat(trade.quantity || 0);
    const entryPrice = parseFloat(trade.entry_price || 0);
    const positionSize = quantity * entryPrice;

    // Basic classification primarily based on current hold time for open positions
    let strategy = 'day_trading'; // Default
    let confidence = 0.6; // Lower confidence for incomplete trades

    if (holdTimeMinutes < 15) {
      strategy = 'scalper';
      confidence = 0.8; // High confidence for very short holds
    } else if (holdTimeMinutes < 240) { // < 4 hours
      strategy = 'day_trading';
      confidence = 0.7;
    } else if (holdTimeMinutes < 480) { // 4-8 hours
      strategy = 'momentum';
      confidence = 0.65;
    } else if (holdTimeMinutes < 1440) { // < 1 day
      strategy = 'mean_reversion';
      confidence = 0.6;
    } else if (holdTimeMinutes < 10080) { // < 1 week
      strategy = 'swing';
      confidence = 0.75;
    } else {
      strategy = 'position';
      confidence = 0.8; // High confidence for very long holds
    }

    // Additional factors for partial classification
    const signals = [];
    
    // Position size analysis (basic)
    if (positionSize > 50000) {
      signals.push('Large position size');
      if (strategy === 'scalper') {
        strategy = 'day_trading'; // Large positions less likely to be scalping
        confidence = Math.max(confidence, 0.7);
      }
    } else if (positionSize < 1000) {
      signals.push('Small position size');
      if (strategy === 'swing' || strategy === 'position') {
        confidence = Math.max(confidence - 0.1, 0.4); // Lower confidence for small swing trades
      }
    }

    // Time of day patterns (basic heuristic)
    const entryHour = entryTime.getHours();
    if (entryHour >= 9 && entryHour <= 11) {
      signals.push('Market open entry');
      if (strategy === 'scalper' || strategy === 'day_trading') {
        confidence = Math.min(confidence + 0.1, 0.9);
      }
    } else if (entryHour >= 15 && entryHour <= 16) {
      signals.push('Market close entry');
      if (strategy === 'scalper') {
        confidence = Math.min(confidence + 0.1, 0.9);
      }
    }

    return {
      strategy,
      confidence,
      signals,
      holdTimeMinutes: Math.round(holdTimeMinutes),
      method: 'basic_time_based'
    };
  }

  // Check for news events on trade date (Pro feature)
  static async checkNewsForTrade(tradeData, userId = null) {
    try {
      // Use the same eligibility check as NewsEnrichmentService
      const newsEnrichmentService = require('../services/newsEnrichmentService');
      const isEligible = await newsEnrichmentService.isNewsEnrichmentEnabled(userId);
      
      if (!isEligible) {
        console.log('News enrichment not available for this user');
        return {
          hasNews: false,
          newsEvents: [],
          sentiment: null,
          checkedAt: new Date().toISOString()
        };
      }

      const finnhub = require('../utils/finnhub');
      
      if (!finnhub.isConfigured()) {
        console.warn('Finnhub not configured, skipping news check');
        return {
          hasNews: false,
          newsEvents: [],
          sentiment: null,
          checkedAt: new Date().toISOString()
        };
      }
      
      const tradeDate = new Date(tradeData.tradeDate || tradeData.entry_time);
      const symbol = tradeData.symbol;
      
      console.log(`Checking news for ${symbol} on ${tradeDate.toISOString().split('T')[0]}`);
      
      const newsData = await newsEnrichmentService.getNewsForSymbolAndDate(symbol, tradeDate, userId);
      
      return {
        hasNews: newsData.hasNews,
        newsEvents: newsData.newsEvents,
        sentiment: newsData.sentiment,
        checkedAt: new Date().toISOString()
      };

    } catch (error) {
      console.warn(`Error checking news for trade: ${error.message}`);
      return {
        hasNews: false,
        newsEvents: [],
        sentiment: null,
        checkedAt: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // Simple sentiment analysis for news headlines and summaries
  static analyzeNewsSentiment(headline, summary) {
    const text = `${headline} ${summary}`.toLowerCase();
    
    const positiveWords = [
      'positive', 'up', 'rise', 'gain', 'growth', 'increase', 'strong', 'beat', 'beats',
      'exceed', 'higher', 'good', 'great', 'excellent', 'profit', 'surge', 'jump',
      'rally', 'bullish', 'breakthrough', 'success', 'upgrade', 'outperform'
    ];
    
    const negativeWords = [
      'negative', 'down', 'fall', 'drop', 'decline', 'decrease', 'weak', 'miss', 'misses',
      'below', 'lower', 'bad', 'poor', 'loss', 'losses', 'plunge', 'crash',
      'bearish', 'concern', 'worry', 'downgrade', 'underperform', 'cut', 'reduce'
    ];

    let positiveScore = 0;
    let negativeScore = 0;

    positiveWords.forEach(word => {
      const matches = (text.match(new RegExp(word, 'g')) || []).length;
      positiveScore += matches;
    });

    negativeWords.forEach(word => {
      const matches = (text.match(new RegExp(word, 'g')) || []).length;
      negativeScore += matches;
    });

    if (positiveScore > negativeScore) {
      return 'positive';
    } else if (negativeScore > positiveScore) {
      return 'negative';
    } else {
      return 'neutral';
    }
  }

  // Calculate overall sentiment from multiple news articles
  static calculateOverallSentiment(newsArticles) {
    if (!newsArticles || newsArticles.length === 0) {
      return null;
    }

    const sentiments = newsArticles.map(article => article.sentiment);
    const positiveCount = sentiments.filter(s => s === 'positive').length;
    const negativeCount = sentiments.filter(s => s === 'negative').length;
    const neutralCount = sentiments.filter(s => s === 'neutral').length;

    if (positiveCount > negativeCount && positiveCount > neutralCount) {
      return 'positive';
    } else if (negativeCount > positiveCount && negativeCount > neutralCount) {
      return 'negative';
    } else if (positiveCount === negativeCount && positiveCount > 0) {
      return 'mixed';
    } else {
      return 'neutral';
    }
  }
}

module.exports = Trade;