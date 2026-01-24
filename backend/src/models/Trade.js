const db = require('../config/database');
const AchievementService = require('../services/achievementService');
const { getUserLocalDate } = require('../utils/timezone');
const { getFuturesPointValue, extractUnderlyingFromFuturesSymbol } = require('../utils/futuresUtils');
const logger = require('../utils/logger');

/**
 * Round a numeric value to fit database precision
 * DECIMAL(20, 8) allows up to 12 integer digits and 8 decimal places
 * @param {number} value - The value to round
 * @param {number} decimals - Number of decimal places (default 8 for max precision)
 * @returns {number|null} - Rounded value or null if input is null/undefined
 */
function roundToDbPrecision(value, decimals = 8) {
  if (value === null || value === undefined || isNaN(value)) return null;
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  const multiplier = Math.pow(10, decimals);
  return Math.round(num * multiplier) / multiplier;
}

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
      executionData, executions, mae, mfe, confidence, tradeDate,
      instrumentType = 'stock', strikePrice, expirationDate, optionType,
      contractSize, underlyingSymbol, contractMonth, contractYear,
      tickSize, pointValue, underlyingAsset, importId,
      originalCurrency, exchangeRate, originalEntryPriceCurrency,
      originalExitPriceCurrency, originalPnlCurrency, originalCommissionCurrency,
      originalFeesCurrency,
      stopLoss, takeProfit, takeProfitTargets, chartUrl,
      brokerConnectionId, accountIdentifier, account_identifier,
      conid, manualTargetHitFirst
    } = tradeData;

    // Use snake_case version if provided, fallback to camelCase for legacy support
    const finalAccountIdentifier = account_identifier || accountIdentifier;

    // Convert empty strings to null for optional fields
    const cleanExitTime = exitTime === '' ? null : exitTime;
    const cleanExitPrice = exitPrice === '' ? null : exitPrice;

    // Handle case where entryTime is null but tradeDate is provided (e.g., from imports)
    // Use tradeDate with a default time of 09:30 (market open)
    const finalEntryTime = entryTime || (tradeDate ? `${tradeDate}T09:30:00` : null);
    if (!finalEntryTime) {
      throw new Error('Entry time is required for creating a trade');
    }

    // Auto-set point value and underlying asset for futures trades if not provided
    let finalPointValue = pointValue;
    let finalUnderlyingAsset = underlyingAsset;
    if (instrumentType === 'future') {
      // If underlying asset is not provided, try to extract it from the symbol
      if (!finalUnderlyingAsset && symbol) {
        finalUnderlyingAsset = extractUnderlyingFromFuturesSymbol(symbol) || underlyingSymbol || null;
      }
      
      // If point value is not provided, look it up based on underlying asset
      if (!finalPointValue && finalUnderlyingAsset) {
        finalPointValue = getFuturesPointValue(finalUnderlyingAsset);
        console.log(`[TRADE] Auto-set point value for ${symbol}: ${finalUnderlyingAsset} = $${finalPointValue} per point`);
      } else if (!finalPointValue && symbol) {
        // Fallback: try to extract underlying from symbol and look up point value
        const extractedUnderlying = extractUnderlyingFromFuturesSymbol(symbol);
        if (extractedUnderlying) {
          finalUnderlyingAsset = extractedUnderlying;
          finalPointValue = getFuturesPointValue(extractedUnderlying);
          console.log(`[TRADE] Auto-set point value for ${symbol}: ${extractedUnderlying} = $${finalPointValue} per point`);
        }
      }
    }

    // Use provided P&L if available (e.g., from Schwab), otherwise calculate it
    // Use finalPointValue which may have been auto-set for futures
    const pnl = providedPnL !== undefined ? providedPnL : this.calculatePnL(entryPrice, cleanExitPrice, quantity, side, commission, fees, instrumentType, contractSize, finalPointValue);
    const pnlPercent = providedPnLPercent !== undefined ? providedPnLPercent : this.calculatePnLPercent(entryPrice, cleanExitPrice, side, pnl, quantity, instrumentType, finalPointValue);

    // Calculate R-Multiple later after applying default stop loss
    // Will be calculated after finalStopLoss is determined
    let rValue = null;

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

    // Apply default stop loss if none provided
    let finalStopLoss = stopLoss;
    let finalTakeProfit = takeProfit;
    let userSettings = null;

    if ((!finalStopLoss || !finalTakeProfit) && entryPrice) {
      try {
        const User = require('./User');
        userSettings = await User.getSettings(userId);

        // Apply default stop loss if not provided
        if (!finalStopLoss) {
          const stopLossType = userSettings?.default_stop_loss_type || 'percent';
          
          if (stopLossType === 'lod') {
            // Use Low of Day (LoD) at entry time
            try {
              const lod = await this.getLowOfDayAtEntry(symbol, finalEntryTime, userId);
              if (lod !== null && lod !== undefined) {
                // For long positions, LoD is the stop loss
                // For short positions, we'd use High of Day, but for now we'll use LoD as requested
                // Note: The issue mentions LoD for swing trades, which are typically long positions
                if (side === 'long' || side === 'buy') {
                  finalStopLoss = lod;
                  // Ensure LoD is below entry price (safety check)
                  if (finalStopLoss >= entryPrice) {
                    console.warn(`[STOP LOSS] LoD (${finalStopLoss}) is not below entry price (${entryPrice}), using entry price - 0.01 as fallback`);
                    finalStopLoss = entryPrice - 0.01;
                  }
                  console.log(`[STOP LOSS] Applied Low of Day (LoD) stop loss for ${side} position: $${finalStopLoss}`);
                } else {
                  // For short positions, LoD doesn't make sense as stop loss
                  // Fall back to percentage if available
                  console.warn(`[STOP LOSS] LoD not applicable for short positions, falling back to percentage`);
                  if (userSettings?.default_stop_loss_percent && userSettings.default_stop_loss_percent > 0) {
                    const stopLossPercent = parseFloat(userSettings.default_stop_loss_percent);
                    finalStopLoss = entryPrice * (1 + stopLossPercent / 100);
                    finalStopLoss = Math.round(finalStopLoss * 10000) / 10000;
                    console.log(`[STOP LOSS] Applied default ${stopLossPercent}% stop loss for ${side} position: $${finalStopLoss}`);
                  }
                }
              } else {
                // LoD fetch failed, fall back to percentage if available
                console.warn(`[STOP LOSS] Failed to fetch LoD, falling back to percentage`);
                if (userSettings?.default_stop_loss_percent && userSettings.default_stop_loss_percent > 0) {
                  const stopLossPercent = parseFloat(userSettings.default_stop_loss_percent);
                  if (side === 'long' || side === 'buy') {
                    finalStopLoss = entryPrice * (1 - stopLossPercent / 100);
                  } else if (side === 'short' || side === 'sell') {
                    finalStopLoss = entryPrice * (1 + stopLossPercent / 100);
                  }
                  finalStopLoss = Math.round(finalStopLoss * 10000) / 10000;
                  console.log(`[STOP LOSS] Applied default ${stopLossPercent}% stop loss for ${side} position: $${finalStopLoss}`);
                }
              }
            } catch (lodError) {
              console.warn(`[STOP LOSS] Error fetching LoD: ${lodError.message}, falling back to percentage`);
              // Fall back to percentage if available
              if (userSettings?.default_stop_loss_percent && userSettings.default_stop_loss_percent > 0) {
                const stopLossPercent = parseFloat(userSettings.default_stop_loss_percent);
                if (side === 'long' || side === 'buy') {
                  finalStopLoss = entryPrice * (1 - stopLossPercent / 100);
                } else if (side === 'short' || side === 'sell') {
                  finalStopLoss = entryPrice * (1 + stopLossPercent / 100);
                }
                finalStopLoss = Math.round(finalStopLoss * 10000) / 10000;
                console.log(`[STOP LOSS] Applied default ${stopLossPercent}% stop loss for ${side} position: $${finalStopLoss}`);
              }
            }
          } else if (userSettings?.default_stop_loss_percent && userSettings.default_stop_loss_percent > 0) {
            // Default percentage-based stop loss
            const stopLossPercent = parseFloat(userSettings.default_stop_loss_percent);

            // Calculate stop loss price based on entry price and side
            // For long positions: entry price - (entry price * stop loss %)
            // For short positions: entry price + (entry price * stop loss %)
            if (side === 'long' || side === 'buy') {
              finalStopLoss = entryPrice * (1 - stopLossPercent / 100);
            } else if (side === 'short' || side === 'sell') {
              finalStopLoss = entryPrice * (1 + stopLossPercent / 100);
            }

            // Round to 2 decimal places for stocks, 4 for precise pricing
            finalStopLoss = Math.round(finalStopLoss * 10000) / 10000;

            console.log(`[STOP LOSS] Applied default ${stopLossPercent}% stop loss for ${side} position: $${finalStopLoss}`);
          }
        }

        // Apply default take profit if not provided
        if (!finalTakeProfit && userSettings?.default_take_profit_percent && userSettings.default_take_profit_percent > 0) {
          const takeProfitPercent = parseFloat(userSettings.default_take_profit_percent);

          // Calculate take profit price based on entry price and side
          // For long positions: entry price + (entry price * take profit %)
          // For short positions: entry price - (entry price * take profit %)
          if (side === 'long' || side === 'buy') {
            finalTakeProfit = entryPrice * (1 + takeProfitPercent / 100);
          } else if (side === 'short' || side === 'sell') {
            finalTakeProfit = entryPrice * (1 - takeProfitPercent / 100);
          }

          // Round to 2 decimal places for stocks, 4 for precise pricing
          finalTakeProfit = Math.round(finalTakeProfit * 10000) / 10000;

          console.log(`[TAKE PROFIT] Applied default ${takeProfitPercent}% take profit for ${side} position: $${finalTakeProfit}`);
        }
      } catch (error) {
        console.warn('[DEFAULTS] Failed to apply default stop loss/take profit:', error.message);
        // Continue without defaults if there's an error
      }
    }

    // Calculate R-Multiple if stop loss and exit price are provided
    // R-Multiple measures actual performance vs initial risk, so we need the actual exit price
    if (finalStopLoss && cleanExitPrice && entryPrice && side) {
      rValue = this.calculateRValue(entryPrice, finalStopLoss, cleanExitPrice, side);
    }

    // Aggregate take profit targets from executions to trade level
    // Execution-level targets REPLACE trade-level targets to avoid duplicates
    const executionList = executions || executionData || [];
    let aggregatedTakeProfitTargets = [];
    let hasExecutionTargets = false;

    logger.debug('[TP-AGGREGATION] ========== TP Target Aggregation ==========');
    logger.debug('[TP-AGGREGATION] Input data:', {
      symbol: symbol,
      hasExecutionList: !!(executionList && executionList.length > 0),
      executionCount: executionList?.length || 0,
      hasTradeLevelTargets: !!(takeProfitTargets && takeProfitTargets.length > 0),
      tradeLevelTargetCount: takeProfitTargets?.length || 0
    });

    if (executionList && executionList.length > 0) {
      executionList.forEach((exec, index) => {
        if (exec.takeProfitTargets && Array.isArray(exec.takeProfitTargets) && exec.takeProfitTargets.length > 0) {
          hasExecutionTargets = true;
          logger.debug(`[TP-AGGREGATION] Execution ${index + 1} has ${exec.takeProfitTargets.length} targets:`, JSON.stringify(exec.takeProfitTargets));
          aggregatedTakeProfitTargets.push(...exec.takeProfitTargets);
        } else {
          logger.debug(`[TP-AGGREGATION] Execution ${index + 1} has no TP targets`);
        }
      });
    }

    // Only use trade-level targets if NO execution-level targets exist
    if (!hasExecutionTargets && takeProfitTargets && takeProfitTargets.length > 0) {
      logger.debug('[TP-AGGREGATION] Using trade-level targets (no execution targets):', JSON.stringify(takeProfitTargets));
      aggregatedTakeProfitTargets = [...takeProfitTargets];
    }

    logger.debug('[TP-AGGREGATION] Final aggregated targets:', {
      count: aggregatedTakeProfitTargets.length,
      source: hasExecutionTargets ? 'executions' : (aggregatedTakeProfitTargets.length > 0 ? 'trade level' : 'none'),
      targets: aggregatedTakeProfitTargets.length > 0 ? JSON.stringify(aggregatedTakeProfitTargets) : '[]'
    });

    if (aggregatedTakeProfitTargets.length > 0) {
      logger.info(`[TP TARGETS] Using ${aggregatedTakeProfitTargets.length} take profit targets (from ${hasExecutionTargets ? 'executions' : 'trade level'})`);
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
        stop_loss, take_profit, take_profit_targets, r_value, chart_url, broker_connection_id, account_identifier, conid, manual_target_hit_first
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53, $54, $55, $56, $57, $58, $59, $60, $61)
      RETURNING *
    `;

    const values = [
      userId, symbol.toUpperCase(), finalTradeDate, finalEntryTime, cleanExitTime,
      roundToDbPrecision(entryPrice), roundToDbPrecision(cleanExitPrice),
      roundToDbPrecision(quantity), side,
      roundToDbPrecision(commission) || 0, roundToDbPrecision(entryCommission) || 0, roundToDbPrecision(exitCommission) || 0,
      roundToDbPrecision(fees) || 0, roundToDbPrecision(pnl), roundToDbPrecision(pnlPercent), notes, isPublic || false,
      broker, finalStrategy, setup, tags || [], JSON.stringify(executions || executionData || []),
      roundToDbPrecision(mae), roundToDbPrecision(mfe), confidence || 5,
      strategyConfidence, classificationMethod, JSON.stringify(classificationMetadata), manualOverride,
      JSON.stringify(newsData.newsEvents || []), newsData.hasNews || false, newsData.sentiment, newsData.checkedAt,
      instrumentType || 'stock', roundToDbPrecision(strikePrice), expirationDate || null, optionType || null,
      contractSize || (instrumentType === 'option' ? 100 : null), underlyingSymbol || null,
      contractMonth || null, contractYear || null, roundToDbPrecision(tickSize), roundToDbPrecision(finalPointValue), finalUnderlyingAsset || null,
      importId || null,
      originalCurrency || 'USD', roundToDbPrecision(exchangeRate) || 1.0,
      roundToDbPrecision(originalEntryPriceCurrency), roundToDbPrecision(originalExitPriceCurrency),
      roundToDbPrecision(originalPnlCurrency), roundToDbPrecision(originalCommissionCurrency), roundToDbPrecision(originalFeesCurrency),
      roundToDbPrecision(finalStopLoss), roundToDbPrecision(finalTakeProfit), JSON.stringify(aggregatedTakeProfitTargets || []),
      roundToDbPrecision(rValue), chartUrl || null, brokerConnectionId || null, finalAccountIdentifier || null,
      conid || null,
      manualTargetHitFirst || null
    ];

    const result = await db.query(query, values);
    const createdTrade = result.rows[0];

    // Log the strategy and setup assignment for debugging
    console.log(`[TRADE CREATE] Trade ${createdTrade.id}: strategy="${finalStrategy || 'null'}", setup="${setup || 'null'}", confidence=${strategyConfidence}%, method=${classificationMethod}`);

    // Log conid for IBKR options tracking
    if (conid) {
      console.log(`[TRADE CREATE] Trade ${createdTrade.id}: conid=${conid} (saved for IBKR position matching)`);
    }
    
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
      SELECT t.*,
        u.username,
        u.avatar_url,
        COALESCE(gp.display_name, u.username) as display_name,
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
(SELECT json_agg(
          jsonb_build_object(
            'id', tch.id,
            'chart_url', tch.chart_url,
            'chart_title', tch.chart_title,
            'uploaded_at', tch.uploaded_at
          ) ORDER BY tch.uploaded_at ASC
        ) FROM trade_charts tch WHERE tch.trade_id = t.id) as charts,
        count(DISTINCT tc.id)::integer as comment_count,
        sc.finnhub_industry as sector,
        sc.company_name as company_name
      FROM trades t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN gamification_profile gp ON u.id = gp.user_id
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

    query += ` GROUP BY t.id, u.username, u.avatar_url, gp.display_name, sc.finnhub_industry, sc.company_name`;

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

    // Convert charts from snake_case to camelCase for frontend
    if (trade && trade.charts && Array.isArray(trade.charts)) {
      trade.charts = trade.charts.map(chart => ({
        id: chart.id,
        chartUrl: chart.chart_url,
        chartTitle: chart.chart_title,
        uploadedAt: chart.uploaded_at
      }));
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
    const startTime = Date.now();
    console.log('[PERF] findByUser started for user:', userId);
    const { getUserTimezone } = require('../utils/timezone');
    
    // Build the WHERE clause and filter values first
    const values = [userId];
    let paramCount = 2;
    let whereClause = 'WHERE t.user_id = $1';
    let needsSectorJoin = false;

    if (filters.symbol) {
      // Enhanced symbol filtering to handle both ticker symbols and CUSIPs
      whereClause += ` AND (
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
      whereClause += ` AND t.trade_date >= $${paramCount}`;
      values.push(filters.startDate);
      paramCount++;
    }

    if (filters.endDate) {
      whereClause += ` AND t.trade_date <= $${paramCount}`;
      values.push(filters.endDate);
      paramCount++;
    }

    // Exit date filters - for filtering by when trades were closed (used by calendar)
    if (filters.exitStartDate) {
      whereClause += ` AND t.exit_time::date >= $${paramCount}`;
      values.push(filters.exitStartDate);
      paramCount++;
    }

    if (filters.exitEndDate) {
      whereClause += ` AND t.exit_time::date <= $${paramCount}`;
      values.push(filters.exitEndDate);
      paramCount++;
    }

    if (filters.tags && filters.tags.length > 0) {
      console.log('[TAGS] Applying tag filter in Trade.findByUser:', filters.tags);
      whereClause += ` AND t.tags && $${paramCount}`;
      values.push(filters.tags);
      paramCount++;
      console.log('[TAGS] Tag filter SQL added, value:', filters.tags);
    }

    // Multi-select strategies filter
    if (filters.strategies && filters.strategies.length > 0) {
      console.log('[TARGET] APPLYING MULTI-SELECT STRATEGIES:', filters.strategies);
      const placeholders = filters.strategies.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND t.strategy IN (${placeholders})`;
      filters.strategies.forEach(strategy => values.push(strategy));
      paramCount += filters.strategies.length;
    }

    // Multi-select sectors filter  
    if (filters.sectors && filters.sectors.length > 0) {
      needsSectorJoin = true;
      const placeholders = filters.sectors.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND sc.finnhub_industry IN (${placeholders})`;
      filters.sectors.forEach(sector => values.push(sector));
      paramCount += filters.sectors.length;
    }

    if (filters.sector) {
      needsSectorJoin = true;
      whereClause += ` AND sc.finnhub_industry = $${paramCount}`;
      values.push(filters.sector);
      paramCount++;
    }

    if (filters.hasNews !== undefined && filters.hasNews !== '' && filters.hasNews !== null) {
      console.log('[CHECK] hasNews filter detected:', { value: filters.hasNews, type: typeof filters.hasNews });
      if (filters.hasNews === 'true' || filters.hasNews === true || filters.hasNews === 1 || filters.hasNews === '1') {
        whereClause += ` AND t.has_news = true`;
        console.log('[CHECK] Applied hasNews=true filter to query');
      } else if (filters.hasNews === 'false' || filters.hasNews === false || filters.hasNews === 0 || filters.hasNews === '0') {
        whereClause += ` AND (t.has_news = false OR t.has_news IS NULL)`;
        console.log('[CHECK] Applied hasNews=false filter to query');
      }
    }

    // Advanced filters
    if (filters.side) {
      whereClause += ` AND t.side = $${paramCount}`;
      values.push(filters.side);
      paramCount++;
    }

    if (filters.minPrice !== undefined) {
      whereClause += ` AND t.entry_price >= $${paramCount}`;
      values.push(filters.minPrice);
      paramCount++;
    }

    if (filters.maxPrice !== undefined) {
      whereClause += ` AND t.entry_price <= $${paramCount}`;
      values.push(filters.maxPrice);
      paramCount++;
    }

    if (filters.minQuantity !== undefined) {
      whereClause += ` AND t.quantity >= $${paramCount}`;
      values.push(filters.minQuantity);
      paramCount++;
    }

    if (filters.maxQuantity !== undefined) {
      whereClause += ` AND t.quantity <= $${paramCount}`;
      values.push(filters.maxQuantity);
      paramCount++;
    }

    if (filters.status === 'open') {
      whereClause += ` AND t.exit_price IS NULL`;
    } else if (filters.status === 'closed') {
      whereClause += ` AND t.exit_price IS NOT NULL`;
    }

    if (filters.minPnl !== undefined) {
      whereClause += ` AND t.pnl >= $${paramCount}`;
      values.push(filters.minPnl);
      paramCount++;
    }

    if (filters.maxPnl !== undefined) {
      whereClause += ` AND t.pnl <= $${paramCount}`;
      values.push(filters.maxPnl);
      paramCount++;
    }

    if (filters.pnlType === 'profit') {
      whereClause += ` AND t.pnl > 0`;
    } else if (filters.pnlType === 'loss') {
      whereClause += ` AND t.pnl < 0`;
    }

    // Days of week filter (timezone-aware)
    if (filters.daysOfWeek && filters.daysOfWeek.length > 0) {
      // Get user's timezone for accurate day calculation
      const userTimezone = await getUserTimezone(userId);
      console.log(`🕒 Using timezone ${userTimezone} for day-of-week filtering`);
      
      // Use entry_time converted to user's timezone for day calculation
      const placeholders = filters.daysOfWeek.map((_, index) => `$${paramCount + index}`).join(',');
      if (userTimezone !== 'UTC') {
        whereClause += ` AND extract(dow from (t.entry_time AT TIME ZONE 'UTC' AT TIME ZONE $${paramCount + filters.daysOfWeek.length})) IN (${placeholders})`;
        filters.daysOfWeek.forEach(dayNum => values.push(dayNum));
        values.push(userTimezone);
        paramCount += filters.daysOfWeek.length + 1;
      } else {
        // UTC case - can use simpler extraction
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

    // Option types filter (call, put) - only applies to options
    if (filters.optionTypes && filters.optionTypes.length > 0) {
      const placeholders = filters.optionTypes.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND t.option_type IN (${placeholders})`;
      filters.optionTypes.forEach(type => values.push(type));
      paramCount += filters.optionTypes.length;
    }

    // Broker filter - support both single and multi-select
    if (filters.brokers) {
      // Handle comma-separated string of brokers (from multi-select)
      const brokerList = filters.brokers.split(',').map(b => b.trim());
      if (brokerList.length > 0) {
        whereClause += ` AND t.broker = ANY($${paramCount}::text[])`;
        values.push(brokerList);
        paramCount++;
      }
    } else if (filters.broker) {
      // Backward compatibility: single broker
      whereClause += ` AND t.broker = $${paramCount}`;
      values.push(filters.broker);
      paramCount++;
    }

    // Account identifier filter - multi-select support
    if (filters.accounts && filters.accounts.length > 0) {
      console.log('[ACCOUNTS] Applying account filter:', filters.accounts);
      const placeholders = filters.accounts.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND t.account_identifier IN (${placeholders})`;
      filters.accounts.forEach(account => values.push(account));
      paramCount += filters.accounts.length;
    }

    // Quality grade filter - multi-select support (A, B, C, D, F)
    if (filters.qualityGrades && filters.qualityGrades.length > 0) {
      console.log('[QUALITY] Applying quality grade filter:', filters.qualityGrades);
      const placeholders = filters.qualityGrades.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND t.quality_grade IN (${placeholders})`;
      filters.qualityGrades.forEach(grade => values.push(grade));
      paramCount += filters.qualityGrades.length;
      console.log('[QUALITY] Added quality filter to query, values:', filters.qualityGrades);
    }

    // Hold time filter
    if (filters.holdTime) {
      whereClause += this.getHoldTimeFilter(filters.holdTime);
    }

    // hasRValue filter - filter to only trades with valid R-value (stop_loss set)
    if (filters.hasRValue !== undefined && filters.hasRValue !== '' && filters.hasRValue !== null) {
      if (filters.hasRValue === 'true' || filters.hasRValue === true || filters.hasRValue === '1') {
        whereClause += ` AND t.stop_loss IS NOT NULL`;
      }
    }

    // Strategy filter
    if (filters.strategy) {
      whereClause += this.getStrategyFilter(filters.strategy);
    }

    // Build subquery to get trade IDs first (with LIMIT/OFFSET applied early)
    // This is the key optimization: we get only the IDs we need, then join
    let subquery = `SELECT t.id FROM trades t`;
    if (needsSectorJoin) {
      subquery += ` LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol`;
    }
    subquery += ` ${whereClause} ORDER BY t.trade_date DESC, t.entry_time DESC`;
    
    if (filters.limit) {
      subquery += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
      paramCount++;
    }

    if (filters.offset) {
      subquery += ` OFFSET $${paramCount}`;
      values.push(filters.offset);
      paramCount++;
    }

    // Now build the main query that joins only the selected trades
    // This way we only aggregate data for the trades we actually return
    const mainQuery = `
      SELECT t.*,
        t.strategy, t.setup,
        array_agg(DISTINCT ta.file_url) FILTER (WHERE ta.id IS NOT NULL) as attachment_urls,
        (SELECT array_agg(tch.chart_url ORDER BY tch.uploaded_at ASC) FROM trade_charts tch WHERE tch.trade_id = t.id) as chart_urls,
        count(DISTINCT tc.id)::integer as comment_count,
        sc.finnhub_industry as sector,
        sc.company_name as company_name
      FROM (${subquery}) AS trade_ids
      INNER JOIN trades t ON t.id = trade_ids.id
      LEFT JOIN trade_attachments ta ON t.id = ta.trade_id
      LEFT JOIN trade_comments tc ON t.id = tc.trade_id
      LEFT JOIN symbol_categories sc ON t.symbol = sc.symbol
      GROUP BY t.id, sc.finnhub_industry, sc.company_name
      ORDER BY t.trade_date DESC, t.entry_time DESC
    `;

    const queryStartTime = Date.now();
    const result = await db.query(mainQuery, values);
    const queryEndTime = Date.now();
    console.log('[PERF] findByUser query took:', queryEndTime - queryStartTime, 'ms, returned', result.rows.length, 'rows');
    console.log('[PERF] findByUser total time:', queryEndTime - startTime, 'ms');
    return result.rows;
  }

  static async update(id, userId, updates, options = {}) {
    // Round all numeric fields to fit database precision (DECIMAL(20,8))
    const numericFields = [
      'entryPrice', 'exitPrice', 'quantity', 'commission', 'entryCommission', 'exitCommission',
      'fees', 'pnl', 'pnlPercent', 'mae', 'mfe', 'strikePrice', 'tickSize', 'pointValue',
      'stopLoss', 'takeProfit', 'rValue', 'exchangeRate',
      'originalEntryPriceCurrency', 'originalExitPriceCurrency', 'originalPnlCurrency',
      'originalCommissionCurrency', 'originalFeesCurrency'
    ];

    numericFields.forEach(field => {
      if (updates[field] !== undefined && updates[field] !== null && updates[field] !== '') {
        updates[field] = roundToDbPrecision(updates[field]);
      }
    });

    // Log stopLoss updates for debugging
    if (updates.stopLoss !== undefined) {
      console.log(`[STOP LOSS UPDATE] Trade ${id}: stopLoss=${updates.stopLoss}`);
    }

    // First get the current trade data for calculations
    const currentTrade = await this.findById(id, userId);

    // Auto-set point value and underlying asset for futures trades if not provided
    const instrumentType = updates.instrumentType || currentTrade.instrument_type || 'stock';
    if (instrumentType === 'future') {
      // If point value is being updated or is missing, auto-set it
      if (updates.pointValue === undefined || updates.pointValue === null) {
        const underlyingAsset = updates.underlyingAsset || currentTrade.underlying_asset;
        const symbol = updates.symbol || currentTrade.symbol;
        
        // Try to extract underlying from symbol if not provided
        let finalUnderlying = underlyingAsset;
        if (!finalUnderlying && symbol) {
          finalUnderlying = extractUnderlyingFromFuturesSymbol(symbol) || updates.underlyingSymbol || currentTrade.underlying_symbol || null;
        }
        
        // Auto-set point value if we have an underlying asset
        if (finalUnderlying && !currentTrade.point_value) {
          const autoPointValue = getFuturesPointValue(finalUnderlying);
          updates.pointValue = autoPointValue;
          if (!updates.underlyingAsset && !currentTrade.underlying_asset) {
            updates.underlyingAsset = finalUnderlying;
          }
          console.log(`[TRADE UPDATE] Auto-set point value for ${symbol}: ${finalUnderlying} = $${autoPointValue} per point`);
        }
      }
    }

    // Convert empty strings to null for optional fields
    if (updates.exitTime === '') updates.exitTime = null;
    if (updates.exitPrice === '') updates.exitPrice = null;
    if (updates.stopLoss === '') updates.stopLoss = null;
    if (updates.takeProfit === '') updates.takeProfit = null;
    
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
      // Use !== undefined to properly handle 0 values for commission and fees
      const pointValue = updates.pointValue !== undefined ? updates.pointValue : currentTrade.point_value;
      updatedTrade.pnl = this.calculatePnL(
        updatedTrade.entry_price,
        updatedTrade.exit_price,
        updatedTrade.quantity,
        updatedTrade.side,
        updates.commission !== undefined ? updates.commission : currentTrade.commission,
        updates.fees !== undefined ? updates.fees : currentTrade.fees,
        updates.instrumentType || currentTrade.instrument_type || 'stock',
        updates.contractSize !== undefined ? updates.contractSize : (currentTrade.contract_size || (currentTrade.instrument_type === 'option' ? 100 : 1)),
        pointValue
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

    // Special handling for executions - replace instead of merge to prevent duplicates
    // Allow execution updates from:
    // 1. Imports (skipApiCalls=true)
    // 2. Frontend edits (to allow commission/fees updates)
    let executionsToSet = null;
    if (updates.executions && updates.executions.length > 0) {
      // Check if executions have actually changed by comparing JSON strings
      const currentExecutionsJson = JSON.stringify(currentTrade.executions || []);
      const newExecutionsJson = JSON.stringify(updates.executions);

      if (currentExecutionsJson !== newExecutionsJson) {
        // For frontend updates (non-imports), preserve original timestamps from current executions
        // to prevent timestamp truncation from breaking duplicate detection
        if (!options.skipApiCalls && currentTrade.executions && currentTrade.executions.length === updates.executions.length) {
          // Merge: keep original timestamps but update other fields (commission, fees, etc.)
          executionsToSet = updates.executions.map((newExec, index) => {
            const currentExec = currentTrade.executions[index];
            if (currentExec) {
              return {
                ...newExec,
                // Preserve original timestamps from the database
                datetime: currentExec.datetime || newExec.datetime,
                entryTime: currentExec.entryTime || newExec.entryTime,
                exitTime: currentExec.exitTime || newExec.exitTime
              };
            }
            return newExec;
          });
          console.log(`[EXECUTION UPDATE] Merging execution updates for trade ${id} (preserving timestamps)`);
        } else {
          // Full replacement for imports or when execution count changes
          executionsToSet = updates.executions;
        }

        console.log(`\n=== EXECUTION UPDATE for Trade ${id} ===`);
        console.log(`Replacing ${(currentTrade.executions || []).length} existing executions with ${executionsToSet.length} new executions`);
        if (executionsToSet.length > 0) {
          console.log(`First execution: ${executionsToSet[0].datetime || executionsToSet[0].entryTime} @ $${executionsToSet[0].price || executionsToSet[0].entryPrice}`);
          console.log(`Last execution: ${executionsToSet[executionsToSet.length-1].datetime || executionsToSet[executionsToSet.length-1].entryTime} @ $${executionsToSet[executionsToSet.length-1].price || executionsToSet[executionsToSet.length-1].entryPrice}`);
        }
        console.log(`=== END EXECUTION UPDATE ===\n`);
      } else {
        console.log(`[EXECUTION UPDATE] Executions unchanged for trade ${id}, skipping update`);
      }
    }

    // Always remove executions from updates since we handle it separately
    delete updates.executions;

    // Aggregate take profit targets from executions to trade level
    // This REPLACES trade-level targets with execution-level targets (source of truth)
    if (executionsToSet && executionsToSet.length > 0) {
      const aggregatedTargets = [];

      executionsToSet.forEach(exec => {
        if (exec.takeProfitTargets && Array.isArray(exec.takeProfitTargets)) {
          aggregatedTargets.push(...exec.takeProfitTargets);
        }
      });

      // Only update if we found execution-level targets
      if (aggregatedTargets.length > 0) {
        updates.takeProfitTargets = aggregatedTargets;
        console.log(`[TP TARGETS UPDATE] Aggregated ${aggregatedTargets.length} take profit targets from executions`);
      }
    }

    // Log all updates for debugging
    console.log(`[TRADE UPDATE] Processing updates for trade ${id}:`, Object.keys(updates));
    if (updates.takeProfitTargets) {
      console.log(`[TRADE UPDATE] takeProfitTargets in updates:`, JSON.stringify(updates.takeProfitTargets));
    }

    // Process all other fields
    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'user_id' && key !== 'created_at') {
        // Convert camelCase to snake_case for database columns
        const dbKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        fields.push(`${dbKey} = $${paramCount}`);

        // Handle JSON/JSONB fields that need serialization
        if (key === 'classificationMetadata' || key === 'newsEvents' || key === 'takeProfitTargets') {
          console.log(`[TRADE UPDATE] Saving ${key} as ${dbKey}:`, JSON.stringify(value));
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
    
    // Add executions if we have them
    if (executionsToSet !== null) {
      fields.push(`executions = $${paramCount}`);
      values.push(JSON.stringify(executionsToSet));
      paramCount++;
    }

    // Check if any P&L-affecting field was actually CHANGED (not just provided)
    // This prevents recalculation when opening and closing a trade without changes
    // Use rounding to avoid floating-point precision issues (e.g., 102.5 vs 102.49999999999999)
    const roundTo = (num, decimals = 6) => {
      if (num === null || num === undefined || isNaN(num)) return null;
      return Math.round(parseFloat(num) * Math.pow(10, decimals)) / Math.pow(10, decimals);
    };

    // Debug logging for P&L update detection
    if (updates.pointValue !== undefined) {
      console.log('[PNL DEBUG] pointValue update check:', {
        updateValue: updates.pointValue,
        currentValue: currentTrade.point_value,
        roundedUpdate: roundTo(updates.pointValue),
        roundedCurrent: roundTo(currentTrade.point_value),
        isDifferent: roundTo(updates.pointValue) !== roundTo(currentTrade.point_value)
      });
    }

    const hasPnLUpdate = (
      (updates.entryPrice !== undefined && roundTo(updates.entryPrice) !== roundTo(currentTrade.entry_price)) ||
      (updates.exitPrice !== undefined && roundTo(updates.exitPrice) !== roundTo(currentTrade.exit_price)) ||
      (updates.quantity !== undefined && roundTo(updates.quantity) !== roundTo(currentTrade.quantity)) ||
      (updates.side !== undefined && updates.side !== currentTrade.side) ||
      (updates.commission !== undefined && roundTo(updates.commission) !== roundTo(currentTrade.commission)) ||
      (updates.fees !== undefined && roundTo(updates.fees) !== roundTo(currentTrade.fees)) ||
      (updates.instrumentType !== undefined && updates.instrumentType !== currentTrade.instrument_type) ||
      (updates.contractSize !== undefined && roundTo(updates.contractSize) !== roundTo(currentTrade.contract_size)) ||
      (updates.pointValue !== undefined && roundTo(updates.pointValue) !== roundTo(currentTrade.point_value)) ||
      (updates.tickSize !== undefined && roundTo(updates.tickSize) !== roundTo(currentTrade.tick_size))
    );

    console.log('[PNL DEBUG] hasPnLUpdate result:', hasPnLUpdate);

    if (hasPnLUpdate) {
      console.log('[PNL UPDATE] Values actually changed, recalculating P&L');
      const instrumentType = updates.instrumentType || currentTrade.instrument_type || 'stock';
      const quantity = updates.quantity !== undefined ? updates.quantity : currentTrade.quantity;
      const pointValue = updates.pointValue !== undefined ? updates.pointValue : currentTrade.point_value;
      const contractSize = updates.contractSize !== undefined ? updates.contractSize : (currentTrade.contract_size || (instrumentType === 'option' ? 100 : 1));
      // Use !== undefined to properly handle 0 values for commission and fees
      const commission = updates.commission !== undefined ? updates.commission : currentTrade.commission;
      const fees = updates.fees !== undefined ? updates.fees : currentTrade.fees;

      const pnl = this.calculatePnL(
        updates.entryPrice !== undefined ? updates.entryPrice : currentTrade.entry_price,
        updates.exitPrice !== undefined ? updates.exitPrice : currentTrade.exit_price,
        quantity,
        updates.side || currentTrade.side,
        commission,
        fees,
        instrumentType,
        contractSize,
        pointValue
      );
      const pnlPercent = this.calculatePnLPercent(
        updates.entryPrice !== undefined ? updates.entryPrice : currentTrade.entry_price,
        updates.exitPrice !== undefined ? updates.exitPrice : currentTrade.exit_price,
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
    // Check executions for stopLoss values (use executionsToSet since updates.executions was deleted above)
    const executionsForRCalc = executionsToSet || currentTrade.executions || [];
    const hasExecutionStopLoss = executionsForRCalc.length > 0 &&
      executionsForRCalc.some(ex => ex.stopLoss !== null && ex.stopLoss !== undefined);

    if (updates.entryPrice !== undefined || updates.exitPrice !== undefined ||
        updates.stopLoss !== undefined || updates.side || executionsToSet !== null) {
      let entryPrice = updates.entryPrice || currentTrade.entry_price;
      let exitPrice = updates.exitPrice !== undefined ? updates.exitPrice : currentTrade.exit_price;
      let stopLoss = updates.stopLoss !== undefined ? updates.stopLoss : currentTrade.stop_loss;
      const side = updates.side || currentTrade.side;

      // If stopLoss is in executions, calculate weighted average
      if (!stopLoss && hasExecutionStopLoss) {
        // For grouped executions with entry/exit prices, use weighted average
        const executionsWithStopLoss = executionsForRCalc.filter(ex => ex.stopLoss);
        if (executionsWithStopLoss.length > 0) {
          // Calculate weighted average entry price and stop loss from executions
          const totalQty = executionsWithStopLoss.reduce((sum, ex) => sum + (ex.quantity || 0), 0);
          if (totalQty > 0) {
            const weightedEntry = executionsWithStopLoss.reduce((sum, ex) =>
              sum + ((ex.entryPrice || 0) * (ex.quantity || 0)), 0) / totalQty;
            const weightedStopLoss = executionsWithStopLoss.reduce((sum, ex) =>
              sum + ((ex.stopLoss || 0) * (ex.quantity || 0)), 0) / totalQty;
            const weightedExit = executionsWithStopLoss.reduce((sum, ex) =>
              sum + ((ex.exitPrice || 0) * (ex.quantity || 0)), 0) / totalQty;

            entryPrice = weightedEntry;
            stopLoss = weightedStopLoss;
            exitPrice = weightedExit || exitPrice;

            console.log('[R-MULTIPLE] Using weighted averages from executions:', { entryPrice, stopLoss, exitPrice });
          }
        }
      }

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

    // Log stopLoss in final query
    if (updates.stopLoss !== undefined) {
      const stopLossIndex = fields.findIndex(f => f.includes('stop_loss'));
      console.log(`[STOP LOSS UPDATE] Final query includes stop_loss: ${stopLossIndex >= 0}`);
      if (stopLossIndex >= 0) {
        console.log(`[STOP LOSS UPDATE] Final value: ${values[stopLossIndex]}`);
      }
    }

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

  static async addChart(tradeId, chartData) {
    const { chartUrl, chartTitle } = chartData;

    const query = `
      INSERT INTO trade_charts (trade_id, chart_url, chart_title)
      VALUES ($1, $2, $3)
      RETURNING *
    `;

    const result = await db.query(query, [tradeId, chartUrl, chartTitle || null]);
    return result.rows[0];
  }

  static async deleteChart(chartId, userId) {
    const query = `
      DELETE FROM trade_charts tch
      USING trades t
      WHERE tch.id = $1 AND tch.trade_id = t.id AND t.user_id = $2
      RETURNING tch.id
    `;

    const result = await db.query(query, [chartId, userId]);
    return result.rows[0];
  }

  static async getPublicTrades(filters = {}) {
    let query = `
      SELECT t.*,
        generate_anonymous_name(u.id) as username,
        u.avatar_url,
        COALESCE(gp.display_name, generate_anonymous_name(u.id)) as display_name,
        array_agg(DISTINCT ta.file_url) FILTER (WHERE ta.id IS NOT NULL) as attachment_urls,
        count(DISTINCT tc.id)::integer as comment_count
      FROM trades t
      JOIN users u ON t.user_id = u.id
      JOIN user_settings us ON u.id = us.user_id
      LEFT JOIN gamification_profile gp ON u.id = gp.user_id
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

    query += ` GROUP BY t.id, u.id, u.username, u.avatar_url, gp.display_name ORDER BY t.created_at DESC`;

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
    // Note: exitPrice === 0 is valid for expired worthless options, so use explicit null checks
    if (exitPrice == null || entryPrice == null || quantity <= 0) return null;

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
    // Note: exitPrice === 0 is valid for expired worthless options, so use explicit null checks
    if (exitPrice == null || entryPrice == null || entryPrice <= 0) return null;

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

  /**
   * Apply default stop loss to all trades without a stop loss
   * This is called when a user updates their default stop loss percentage setting
   * @param {number} userId - The user ID
   * @param {number} defaultStopLossPercent - The default stop loss percentage
   * @returns {Promise<number>} The number of trades updated
   */
  static async applyDefaultStopLossToExistingTrades(userId, defaultStopLossPercent) {
    if (!defaultStopLossPercent || defaultStopLossPercent <= 0) {
      console.log('[STOP LOSS] Invalid default stop loss percentage, skipping update');
      return 0;
    }

    console.log(`[STOP LOSS] Applying ${defaultStopLossPercent}% default stop loss to existing trades without stop loss for user ${userId}`);

    // Use a transaction to update all trades at once
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Find all trades without a stop loss that have the necessary data
      const tradesQuery = `
        SELECT id, entry_price, exit_price, side
        FROM trades
        WHERE user_id = $1
          AND stop_loss IS NULL
          AND entry_price IS NOT NULL
          AND side IS NOT NULL
      `;

      const tradesResult = await client.query(tradesQuery, [userId]);
      const trades = tradesResult.rows;

      console.log(`[STOP LOSS] Found ${trades.length} trades without stop loss`);

      if (trades.length === 0) {
        await client.query('COMMIT');
        return 0;
      }

      let updatedCount = 0;

      // Update each trade with the calculated stop loss
      for (const trade of trades) {
        const { id, entry_price, exit_price, side } = trade;

        // Calculate stop loss based on entry price and side
        let stopLoss;
        if (side === 'long' || side === 'buy') {
          stopLoss = entry_price * (1 - defaultStopLossPercent / 100);
        } else if (side === 'short' || side === 'sell') {
          stopLoss = entry_price * (1 + defaultStopLossPercent / 100);
        } else {
          console.warn(`[STOP LOSS] Unknown side "${side}" for trade ${id}, skipping`);
          continue;
        }

        // Round to 4 decimal places
        stopLoss = Math.round(stopLoss * 10000) / 10000;

        // Calculate R value if exit price exists
        let rValue = null;
        if (exit_price) {
          rValue = this.calculateRValue(entry_price, stopLoss, exit_price, side);
        }

        // Update the trade
        const updateQuery = `
          UPDATE trades
          SET stop_loss = $1, r_value = $2
          WHERE id = $3 AND user_id = $4
        `;

        await client.query(updateQuery, [stopLoss, rValue, id, userId]);
        updatedCount++;
      }

      await client.query('COMMIT');
      console.log(`[STOP LOSS] Successfully updated ${updatedCount} trades with default stop loss`);
      return updatedCount;

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[STOP LOSS] Error applying default stop loss to existing trades:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Apply default take profit to all trades without a take profit
   * This is called when a user updates their default take profit percentage setting
   * @param {number} userId - The user ID
   * @param {number} defaultTakeProfitPercent - The default take profit percentage
   * @returns {Promise<number>} The number of trades updated
   */
  static async applyDefaultTakeProfitToExistingTrades(userId, defaultTakeProfitPercent) {
    if (!defaultTakeProfitPercent || defaultTakeProfitPercent <= 0) {
      console.log('[TAKE PROFIT] Invalid default take profit percentage, skipping update');
      return 0;
    }

    console.log(`[TAKE PROFIT] Applying ${defaultTakeProfitPercent}% default take profit to existing trades without take profit for user ${userId}`);

    // Use a transaction to update all trades at once
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      // Find all trades without a take profit that have the necessary data
      const tradesQuery = `
        SELECT id, entry_price, side
        FROM trades
        WHERE user_id = $1
          AND take_profit IS NULL
          AND entry_price IS NOT NULL
          AND side IS NOT NULL
      `;

      const tradesResult = await client.query(tradesQuery, [userId]);
      const trades = tradesResult.rows;

      console.log(`[TAKE PROFIT] Found ${trades.length} trades without take profit`);

      if (trades.length === 0) {
        await client.query('COMMIT');
        return 0;
      }

      let updatedCount = 0;

      // Update each trade with the calculated take profit
      for (const trade of trades) {
        const { id, entry_price, side } = trade;

        // Calculate take profit based on entry price and side
        let takeProfit;
        if (side === 'long' || side === 'buy') {
          takeProfit = entry_price * (1 + defaultTakeProfitPercent / 100);
        } else if (side === 'short' || side === 'sell') {
          takeProfit = entry_price * (1 - defaultTakeProfitPercent / 100);
        } else {
          console.warn(`[TAKE PROFIT] Unknown side "${side}" for trade ${id}, skipping`);
          continue;
        }

        // Round to 4 decimal places
        takeProfit = Math.round(takeProfit * 10000) / 10000;

        // Update the trade
        const updateQuery = `
          UPDATE trades
          SET take_profit = $1
          WHERE id = $2 AND user_id = $3
        `;

        await client.query(updateQuery, [takeProfit, id, userId]);
        updatedCount++;
      }

      await client.query('COMMIT');
      console.log(`[TAKE PROFIT] Successfully updated ${updatedCount} trades with default take profit`);
      return updatedCount;

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('[TAKE PROFIT] Error applying default take profit to existing trades:', error);
      throw error;
    } finally {
      client.release();
    }
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

    // Account identifier filter - multi-select support for broker accounts
    if (filters.accounts && filters.accounts.length > 0) {
      console.log('[ACCOUNTS] ANALYTICS: Applying account filter:', filters.accounts);
      const placeholders = filters.accounts.map((_, index) => `$${paramCount + index}`).join(',');
      whereClause += ` AND t.account_identifier IN (${placeholders})`;
      filters.accounts.forEach(account => values.push(account));
      paramCount += filters.accounts.length;
    }

    // hasRValue filter - filter to only trades with valid R-value (stop_loss set)
    if (filters.hasRValue !== undefined && filters.hasRValue !== '' && filters.hasRValue !== null) {
      if (filters.hasRValue === 'true' || filters.hasRValue === true || filters.hasRValue === '1') {
        whereClause += ` AND t.stop_loss IS NOT NULL`;
      }
    }

    console.log('Analytics query - whereClause:', whereClause);
    console.log('Analytics query - values:', values);
    
    // Debug the full query construction
    console.log('[CHECK] About to execute analytics query with', values.length, 'parameters');
    
    // Execute independent queries in parallel for better performance
    const executionCountQuery = `
      SELECT COUNT(*) as execution_count
      FROM trades t
      ${whereClause}
    `;

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

    // Execute all independent queries in parallel for better performance
    const [
      executionResult,
      analyticsResult,
      symbolResult,
      dailyPnLResult,
      dailyWinRateResult,
      topTradesResult,
      bestWorstResult
    ] = await Promise.all([
      db.query(executionCountQuery, values),
      db.query(analyticsQuery, values),
        db.query(`
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
      `, values),
      // Get daily P&L for charting - simplified to work with any data
      db.query(`
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
      `, values),
      // Get daily win rate data - simplified
      db.query(`
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
      `, values),
      // Get best and worst individual trades (not grouped)
      db.query(`
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
      `, values),
      // Get individual best and worst trades for the metric cards
      db.query(`
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
      `, values)
    ]);

    const executionCount = parseInt(executionResult.rows[0].execution_count) || 0;
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

  static async getMonthlyPerformance(userId, year, accounts = null) {
    console.log(`[MONTHLY] Getting monthly performance for user ${userId}, year ${year}, accounts:`, accounts);

    // Build account filter condition
    let accountFilter = '';
    const params = [userId, year];
    if (accounts && accounts.length > 0) {
      const placeholders = accounts.map((_, i) => `$${i + 3}`).join(',');
      accountFilter = ` AND account_identifier IN (${placeholders})`;
      params.push(...accounts);
    }

    const monthlyQuery = `
      WITH monthly_trades AS (
        SELECT
          EXTRACT(MONTH FROM trade_date) as month,
          COUNT(*)::integer as total_trades,
          COUNT(*) FILTER (WHERE pnl > 0)::integer as winning_trades,
          COUNT(*) FILTER (WHERE pnl < 0)::integer as losing_trades,
          COUNT(*) FILTER (WHERE pnl = 0)::integer as breakeven_trades,
          COALESCE(SUM(pnl), 0)::numeric as total_pnl,
          COALESCE(AVG(pnl), 0)::numeric as avg_pnl,
          COALESCE(AVG(pnl) FILTER (WHERE pnl > 0), 0)::numeric as avg_win,
          COALESCE(AVG(pnl) FILTER (WHERE pnl < 0), 0)::numeric as avg_loss,
          COALESCE(MAX(pnl), 0)::numeric as best_trade,
          COALESCE(MIN(pnl), 0)::numeric as worst_trade,
          COALESCE(AVG(r_value) FILTER (WHERE r_value IS NOT NULL AND stop_loss IS NOT NULL), 0)::numeric as avg_r_value,
          COALESCE(SUM(r_value) FILTER (WHERE r_value IS NOT NULL AND stop_loss IS NOT NULL), 0)::numeric as total_r_value,
          COUNT(DISTINCT symbol)::integer as symbols_traded,
          COUNT(DISTINCT trade_date)::integer as trading_days
        FROM trades
        WHERE user_id = $1
          AND EXTRACT(YEAR FROM trade_date) = $2
          AND exit_price IS NOT NULL
          AND pnl IS NOT NULL${accountFilter}
        GROUP BY EXTRACT(MONTH FROM trade_date)
      ),
      all_months AS (
        SELECT generate_series(1, 12) as month
      )
      SELECT
        am.month,
        COALESCE(mt.total_trades, 0) as total_trades,
        COALESCE(mt.winning_trades, 0) as winning_trades,
        COALESCE(mt.losing_trades, 0) as losing_trades,
        COALESCE(mt.breakeven_trades, 0) as breakeven_trades,
        COALESCE(mt.total_pnl, 0) as total_pnl,
        COALESCE(mt.avg_pnl, 0) as avg_pnl,
        COALESCE(mt.avg_win, 0) as avg_win,
        COALESCE(mt.avg_loss, 0) as avg_loss,
        COALESCE(mt.best_trade, 0) as best_trade,
        COALESCE(mt.worst_trade, 0) as worst_trade,
        COALESCE(mt.avg_r_value, 0) as avg_r_value,
        COALESCE(mt.total_r_value, 0) as total_r_value,
        COALESCE(mt.symbols_traded, 0) as symbols_traded,
        COALESCE(mt.trading_days, 0) as trading_days,
        CASE
          WHEN COALESCE(mt.total_trades, 0) = 0 THEN 0
          ELSE (COALESCE(mt.winning_trades, 0) * 100.0 / mt.total_trades)
        END as win_rate,
        TO_CHAR(TO_DATE(am.month::text, 'MM'), 'Month') as month_name
      FROM all_months am
      LEFT JOIN monthly_trades mt ON am.month = mt.month
      ORDER BY am.month
    `;

    try {
      const result = await db.query(monthlyQuery, params);

      // Format the data for easier consumption
      const monthlyData = result.rows.map(row => ({
        month: parseInt(row.month),
        monthName: row.month_name.trim(),
        trades: {
          total: parseInt(row.total_trades) || 0,
          wins: parseInt(row.winning_trades) || 0,
          losses: parseInt(row.losing_trades) || 0,
          breakeven: parseInt(row.breakeven_trades) || 0
        },
        pnl: {
          total: parseFloat(row.total_pnl) || 0,
          average: parseFloat(row.avg_pnl) || 0,
          avgWin: parseFloat(row.avg_win) || 0,
          avgLoss: parseFloat(row.avg_loss) || 0,
          best: parseFloat(row.best_trade) || 0,
          worst: parseFloat(row.worst_trade) || 0
        },
        metrics: {
          winRate: parseFloat(row.win_rate) || 0,
          avgRValue: parseFloat(row.avg_r_value) || 0,
          totalRValue: parseFloat(row.total_r_value) || 0,
          symbolsTraded: parseInt(row.symbols_traded) || 0,
          tradingDays: parseInt(row.trading_days) || 0
        }
      }));

      // Calculate year totals
      const yearTotals = monthlyData.reduce((acc, month) => {
        acc.trades.total += month.trades.total;
        acc.trades.wins += month.trades.wins;
        acc.trades.losses += month.trades.losses;
        acc.trades.breakeven += month.trades.breakeven;
        acc.pnl.total += month.pnl.total;

        // Track best/worst across all months
        if (month.pnl.best > acc.pnl.best) {
          acc.pnl.best = month.pnl.best;
        }
        if (month.pnl.worst < acc.pnl.worst) {
          acc.pnl.worst = month.pnl.worst;
        }

        // Accumulate for averaging
        if (month.trades.total > 0) {
          acc.monthsWithTrades++;
          acc.totalRValue += month.metrics.totalRValue;
        }

        return acc;
      }, {
        trades: { total: 0, wins: 0, losses: 0, breakeven: 0 },
        pnl: { total: 0, best: 0, worst: 0 },
        monthsWithTrades: 0,
        totalRValue: 0
      });

      // Calculate year averages
      yearTotals.metrics = {
        winRate: yearTotals.trades.total > 0
          ? (yearTotals.trades.wins * 100.0 / yearTotals.trades.total)
          : 0,
        avgRValue: yearTotals.trades.total > 0
          ? yearTotals.totalRValue / yearTotals.trades.total
          : 0,
        totalRValue: yearTotals.totalRValue,
        avgMonthlyPnL: yearTotals.monthsWithTrades > 0
          ? yearTotals.pnl.total / yearTotals.monthsWithTrades
          : 0
      };

      console.log(`[MONTHLY] Found data for ${monthlyData.length} months in year ${year}`);
      console.log(`[MONTHLY] Total R-Value sum: ${yearTotals.totalRValue.toFixed(2)}R`);

      return {
        monthly: monthlyData,
        yearTotals: {
          trades: yearTotals.trades,
          pnl: {
            total: yearTotals.pnl.total,
            best: yearTotals.pnl.best,
            worst: yearTotals.pnl.worst,
            avgMonthly: yearTotals.metrics.avgMonthlyPnL
          },
          metrics: yearTotals.metrics
        }
      };
    } catch (error) {
      console.error('[ERROR] Failed to get monthly performance:', error);
      throw error;
    }
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

  static async getAccountList(userId) {
    const query = `
      SELECT DISTINCT account_identifier
      FROM trades
      WHERE user_id = $1 AND account_identifier IS NOT NULL AND account_identifier != ''
      ORDER BY account_identifier
    `;
    const result = await db.query(query, [userId]);
    return result.rows.map(row => row.account_identifier);
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
          indicators.rsi = await finnhub.getTechnicalIndicator(symbol, resolution, analysisStart, analysisEnd, 'rsi', { timeperiod: 14 }, userId);
        } catch (error) {
          console.warn(`RSI failed for ${symbol}: ${error.message}`);

          // Try one simple fallback: daily data with minimal range
          if (error.message.includes('Timeperiod is too long') || error.message.includes('422')) {
            try {
              // Minimal approach: 30 days of daily data only
              console.warn(`Retrying RSI for ${symbol} with minimal daily data`);
              const minimalStart = tradeStart - (30 * 24 * 60 * 60); // 30 days only
              const minimalEnd = tradeEnd; // No extra days after
              indicators.rsi = await finnhub.getTechnicalIndicator(symbol, 'D', minimalStart, minimalEnd, 'rsi', { timeperiod: 14 }, userId);
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
        }, userId);
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
        }, userId);
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
            }, userId);
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

  /**
   * Get Low of Day (LoD) at entry time for a symbol
   * This is used for Qullamaggie-style swing trades where stop loss is set to the low of the entry day
   * The LoD is captured at the time of entry, ensuring it reflects the actual low up to that point
   * @param {string} symbol - Stock symbol
   * @param {Date|string} entryTime - Entry time of the trade
   * @param {string} userId - User ID for API usage tracking
   * @returns {Promise<number|null>} - Low of Day price up to entry time, or null if unavailable
   */
  static async getLowOfDayAtEntry(symbol, entryTime, userId = null) {
    try {
      const finnhub = require('../utils/finnhub');
      
      if (!finnhub.isConfigured()) {
        console.warn('[LoD] Finnhub not configured, cannot fetch Low of Day');
        return null;
      }

      const entryDate = new Date(entryTime);
      
      // Ensure entry time is valid
      if (isNaN(entryDate.getTime())) {
        console.warn(`[LoD] Invalid entry time: ${entryTime}`);
        return null;
      }
      
      // Get the start of the trading day (4:00 AM ET)
      // Properly handle EST/EDT transitions by calculating the UTC offset for the entry date
      // EST = UTC-5 (winter), EDT = UTC-4 (summer)
      const entryDateStr = entryDate.toISOString().split('T')[0]; // Get YYYY-MM-DD
      
      // Calculate UTC offset for Eastern Time on this specific date
      // Create a test date at noon UTC and compare with ET representation
      const testUTC = new Date(`${entryDateStr}T12:00:00.000Z`);
      
      // Get the ET representation of this UTC time
      // Format: "MM/DD/YYYY, HH:MM:SS AM/PM" in ET
      const etParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(testUTC);
      
      const etHour = parseInt(etParts.find(p => p.type === 'hour').value);
      
      // Calculate offset: if UTC 12:00 = ET X:00, then offset = 12 - X
      // EST: UTC 12:00 = ET 7:00, offset = 5 hours
      // EDT: UTC 12:00 = ET 8:00, offset = 4 hours
      const offsetHours = 12 - etHour;
      
      // Now create 4:00 AM ET in UTC
      // 4:00 AM ET = (4 + offsetHours) in UTC
      const utcHour4amET = 4 + offsetHours;
      const dayStart = new Date(`${entryDateStr}T${String(utcHour4amET).padStart(2, '0')}:00:00.000Z`);
      
      // Entry time in Unix timestamp (seconds)
      const entryTimestamp = Math.floor(entryDate.getTime() / 1000);
      const dayStartTimestamp = Math.floor(dayStart.getTime() / 1000);
      
      // Ensure entry time is after day start
      if (entryTimestamp <= dayStartTimestamp) {
        console.warn(`[LoD] Entry time is before market open, cannot determine LoD`);
        // Try using daily candle as fallback
        try {
          const dailyCandles = await finnhub.getStockCandles(symbol, 'D', dayStartTimestamp - 86400, entryTimestamp, userId);
          if (dailyCandles && dailyCandles.length > 0) {
            const lastCandle = dailyCandles[dailyCandles.length - 1];
            const dailyLow = parseFloat(lastCandle.low);
            if (!isNaN(dailyLow)) {
              console.log(`[LoD] Using daily candle low for ${symbol}: $${dailyLow.toFixed(2)}`);
              return roundToDbPrecision(dailyLow, 4);
            }
          }
        } catch (dailyError) {
          console.warn(`[LoD] Failed to fetch daily candle as fallback: ${dailyError.message}`);
        }
        return null;
      }
      
      // Fetch 1-minute candles from start of day to entry time
      // This gives us the intraday low up to the entry point (not the full day)
      let candles = await finnhub.getStockCandles(symbol, '1', dayStartTimestamp, entryTimestamp, userId);
      
      // If 1-minute data is not available, try 5-minute candles as fallback
      if (!candles || candles.length === 0) {
        console.log(`[LoD] No 1-minute data available, trying 5-minute candles`);
        candles = await finnhub.getStockCandles(symbol, '5', dayStartTimestamp, entryTimestamp, userId);
      }
      
      // If still no data, try daily candle as last resort
      if (!candles || candles.length === 0) {
        console.log(`[LoD] No intraday data available, trying daily candle`);
        const dailyCandles = await finnhub.getStockCandles(symbol, 'D', dayStartTimestamp - 86400, entryTimestamp, userId);
        if (dailyCandles && dailyCandles.length > 0) {
          const lastCandle = dailyCandles[dailyCandles.length - 1];
          const dailyLow = parseFloat(lastCandle.low);
          if (!isNaN(dailyLow)) {
            console.log(`[LoD] Using daily candle low for ${symbol}: $${dailyLow.toFixed(2)}`);
            return roundToDbPrecision(dailyLow, 4);
          }
        }
        console.warn(`[LoD] No candle data available for ${symbol} on entry day`);
        return null;
      }
      
      // Find the minimum low price from all candles up to entry time
      const lows = candles.map(c => parseFloat(c.low)).filter(l => !isNaN(l));
      
      if (lows.length === 0) {
        console.warn(`[LoD] No valid low prices found for ${symbol}`);
        return null;
      }
      
      const lod = Math.min(...lows);
      
      console.log(`[LoD] Low of Day for ${symbol} at entry time: $${lod.toFixed(2)} (from ${candles.length} candles)`);
      
      return roundToDbPrecision(lod, 4);
    } catch (error) {
      console.warn(`[LoD] Error fetching Low of Day for ${symbol}: ${error.message}`);
      return null;
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