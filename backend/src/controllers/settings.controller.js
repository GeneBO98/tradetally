const User = require('../models/User');
const db = require('../config/database');
const adminSettingsService = require('../services/adminSettings');

// Helper function to convert snake_case to camelCase
function toCamelCase(obj) {
  if (!obj) return obj;
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

const settingsController = {
  async getSettings(req, res, next) {
    try {
      let settings = await User.getSettings(req.user.id);
      
      if (!settings) {
        settings = await User.createSettings(req.user.id);
      }

      // Convert snake_case to camelCase for frontend
      const camelCaseSettings = toCamelCase(settings);
      
      res.json({ settings: camelCaseSettings });
    } catch (error) {
      next(error);
    }
  },

  async updateSettings(req, res, next) {
    try {
      const settings = await User.updateSettings(req.user.id, req.body);
      // Convert snake_case to camelCase for frontend
      const camelCaseSettings = toCamelCase(settings);
      res.json({ settings: camelCaseSettings });
    } catch (error) {
      next(error);
    }
  },

  async getTags(req, res, next) {
    try {
      const query = `
        SELECT * FROM tags
        WHERE user_id = $1
        ORDER BY name
      `;

      const result = await db.query(query, [req.user.id]);
      
      res.json({ tags: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async createTag(req, res, next) {
    try {
      const { name, color = '#3B82F6' } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({ error: 'Tag name is required' });
      }

      const query = `
        INSERT INTO tags (user_id, name, color)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id, name) DO NOTHING
        RETURNING *
      `;

      const result = await db.query(query, [req.user.id, name.trim(), color]);
      
      if (result.rows.length === 0) {
        return res.status(409).json({ error: 'Tag already exists' });
      }

      res.status(201).json({ tag: result.rows[0] });
    } catch (error) {
      next(error);
    }
  },

  async updateTag(req, res, next) {
    try {
      const { name, color } = req.body;
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (name) {
        updates.push(`name = $${paramCount}`);
        values.push(name.trim());
        paramCount++;
      }

      if (color) {
        updates.push(`color = $${paramCount}`);
        values.push(color);
        paramCount++;
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No updates provided' });
      }

      values.push(req.params.id, req.user.id);

      const query = `
        UPDATE tags
        SET ${updates.join(', ')}
        WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
        RETURNING *
      `;

      const result = await db.query(query, values);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      res.json({ tag: result.rows[0] });
    } catch (error) {
      next(error);
    }
  },

  async deleteTag(req, res, next) {
    try {
      const query = `
        DELETE FROM tags
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `;

      const result = await db.query(query, [req.params.id, req.user.id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Tag not found' });
      }

      res.json({ message: 'Tag deleted successfully' });
    } catch (error) {
      next(error);
    }
  },

  async getAIProviderSettings(req, res, next) {
    try {
      const settings = await User.getSettings(req.user.id);
      
      if (!settings) {
        return res.json({
          aiProvider: 'gemini',
          aiApiKey: '',
          aiApiUrl: '',
          aiModel: ''
        });
      }

      res.json({
        aiProvider: settings.ai_provider || 'gemini',
        aiApiKey: settings.ai_api_key || '',
        aiApiUrl: settings.ai_api_url || '',
        aiModel: settings.ai_model || ''
      });
    } catch (error) {
      next(error);
    }
  },

  async updateAIProviderSettings(req, res, next) {
    try {
      const { aiProvider, aiApiKey, aiApiUrl, aiModel } = req.body;

      // Validate AI provider
      const validProviders = ['gemini', 'claude', 'openai', 'ollama', 'lmstudio', 'perplexity', 'local'];
      if (aiProvider && !validProviders.includes(aiProvider)) {
        return res.status(400).json({ 
          error: 'Invalid AI provider. Must be one of: ' + validProviders.join(', ')
        });
      }

      // Validate required fields
      if (aiProvider && !['local', 'ollama', 'lmstudio'].includes(aiProvider) && !aiApiKey) {
        return res.status(400).json({ 
          error: 'API key is required for ' + aiProvider 
        });
      }

      if (['local', 'ollama', 'lmstudio'].includes(aiProvider) && !aiApiUrl) {
        return res.status(400).json({ 
          error: 'API URL is required for ' + aiProvider 
        });
      }

      const aiSettings = {
        ai_provider: aiProvider,
        ai_api_key: aiApiKey,
        ai_api_url: aiApiUrl,
        ai_model: aiModel
      };

      const settings = await User.updateSettings(req.user.id, aiSettings);
      
      res.json({
        message: 'AI provider settings updated successfully',
        aiProvider: settings.ai_provider,
        aiApiKey: settings.ai_api_key ? '***' : '', // Mask the API key in response
        aiApiUrl: settings.ai_api_url,
        aiModel: settings.ai_model
      });
    } catch (error) {
      next(error);
    }
  },

  async resetSettings(req, res, next) {
    try {
      res.json({
        message: 'Settings reset not yet implemented',
        reset: false
      });
    } catch (error) {
      next(error);
    }
  },

  async getTradingProfile(req, res, next) {
    try {
      const settings = await User.getSettings(req.user.id);
      
      if (!settings) {
        const newSettings = await User.createSettings(req.user.id);
        return res.json({ 
          tradingProfile: {
            tradingStrategies: [],
            tradingStyles: [],
            riskTolerance: 'moderate',
            primaryMarkets: [],
            experienceLevel: 'intermediate',
            averagePositionSize: 'medium',
            tradingGoals: [],
            preferredSectors: []
          }
        });
      }

      const tradingProfile = {
        tradingStrategies: settings.trading_strategies || [],
        tradingStyles: settings.trading_styles || [],
        riskTolerance: settings.risk_tolerance || 'moderate',
        primaryMarkets: settings.primary_markets || [],
        experienceLevel: settings.experience_level || 'intermediate',
        averagePositionSize: settings.average_position_size || 'medium',
        tradingGoals: settings.trading_goals || [],
        preferredSectors: settings.preferred_sectors || []
      };

      res.json({ tradingProfile });
    } catch (error) {
      next(error);
    }
  },

  async updateTradingProfile(req, res, next) {
    try {
      const {
        tradingStrategies,
        tradingStyles,
        riskTolerance,
        primaryMarkets,
        experienceLevel,
        averagePositionSize,
        tradingGoals,
        preferredSectors
      } = req.body;

      // Validate the data
      const validRiskLevels = ['conservative', 'moderate', 'aggressive'];
      const validExperienceLevels = ['beginner', 'intermediate', 'advanced', 'expert'];
      const validPositionSizes = ['small', 'medium', 'large'];

      if (riskTolerance && !validRiskLevels.includes(riskTolerance)) {
        return res.status(400).json({ error: 'Invalid risk tolerance level' });
      }

      if (experienceLevel && !validExperienceLevels.includes(experienceLevel)) {
        return res.status(400).json({ error: 'Invalid experience level' });
      }

      if (averagePositionSize && !validPositionSizes.includes(averagePositionSize)) {
        return res.status(400).json({ error: 'Invalid position size' });
      }

      const profileData = {
        tradingStrategies: tradingStrategies || [],
        tradingStyles: tradingStyles || [],
        riskTolerance: riskTolerance || 'moderate',
        primaryMarkets: primaryMarkets || [],
        experienceLevel: experienceLevel || 'intermediate',
        averagePositionSize: averagePositionSize || 'medium',
        tradingGoals: tradingGoals || [],
        preferredSectors: preferredSectors || []
      };

      const updatedSettings = await User.updateSettings(req.user.id, profileData);
      
      res.json({ 
        message: 'Trading profile updated successfully',
        tradingProfile: profileData
      });
    } catch (error) {
      next(error);
    }
  },

  async exportUserData(req, res, next) {
    try {
      const userId = req.user.id;
      console.log('[EXPORT] Starting full data export for user:', userId);

      // Get user profile
      const userResult = await db.query(
        `SELECT username, full_name, email, timezone FROM users WHERE id = $1`,
        [userId]
      );
      const user = userResult.rows[0];

      // Get user settings (includes trading profile and ALL settings)
      const settingsResult = await db.query(
        `SELECT * FROM user_settings WHERE user_id = $1`,
        [userId]
      );
      const settings = settingsResult.rows[0];

      // Get all trades with ALL fields
      const tradesResult = await db.query(
        `SELECT * FROM trades WHERE user_id = $1 ORDER BY created_at`,
        [userId]
      );
      const trades = tradesResult.rows;
      console.log(`[EXPORT] Exporting ${trades.length} trades`);

      // Get all tags
      const tagsResult = await db.query(
        `SELECT * FROM tags WHERE user_id = $1`,
        [userId]
      );
      const tags = tagsResult.rows;

      // Get equity history (with fallback to equity_snapshots if equity_history doesn't exist)
      let equityHistory = [];
      try {
        const equityResult = await db.query(
          `SELECT * FROM equity_history WHERE user_id = $1 ORDER BY date`,
          [userId]
        );
        equityHistory = equityResult.rows;
      } catch (error) {
        // If equity_history doesn't exist, try equity_snapshots
        try {
          const equitySnapshotsResult = await db.query(
            `SELECT
              user_id,
              snapshot_date as date,
              equity_amount as equity,
              0.00 as pnl,
              created_at,
              updated_at
            FROM equity_snapshots WHERE user_id = $1 ORDER BY snapshot_date`,
            [userId]
          );
          equityHistory = equitySnapshotsResult.rows;
        } catch (snapshotError) {
          // If neither table exists, continue with empty equity history
          console.warn('[EXPORT] No equity tracking tables found, continuing with empty equity history');
        }
      }

      // Get diary entries (excluding playbook to avoid duplicates)
      let diaryEntries = [];
      try {
        const diaryResult = await db.query(
          `SELECT * FROM diary_entries WHERE user_id = $1 ORDER BY entry_date`,
          [userId]
        );
        diaryEntries = diaryResult.rows;
        console.log(`[EXPORT] Exporting ${diaryEntries.length} diary entries`);
      } catch (error) {
        console.warn('[EXPORT] Unable to fetch diary entries:', error.message);
      }

      // Get diary templates
      let diaryTemplates = [];
      try {
        const templatesResult = await db.query(
          `SELECT * FROM diary_templates WHERE user_id = $1 ORDER BY created_at`,
          [userId]
        );
        diaryTemplates = templatesResult.rows;
        console.log(`[EXPORT] Exporting ${diaryTemplates.length} diary templates`);
      } catch (error) {
        console.warn('[EXPORT] Unable to fetch diary templates:', error.message);
      }

      // Get broker fee settings
      let brokerFeeSettings = [];
      try {
        const brokerFeesResult = await db.query(
          `SELECT * FROM broker_fee_settings WHERE user_id = $1 ORDER BY broker, instrument`,
          [userId]
        );
        brokerFeeSettings = brokerFeesResult.rows;
        console.log(`[EXPORT] Exporting ${brokerFeeSettings.length} broker fee settings`);
      } catch (error) {
        console.warn('[EXPORT] Unable to fetch broker fee settings:', error.message);
      }

      // Create export data with ALL fields - Version 2.0 with complete data
      const exportData = {
        exportVersion: '2.0',
        exportDate: new Date().toISOString(),
        user: {
          username: user.username,
          fullName: user.full_name,
          email: user.email,
          timezone: user.timezone
        },
        // Complete settings export including trade grouping, AI settings, etc.
        settings: settings ? {
          emailNotifications: settings.email_notifications,
          publicProfile: settings.public_profile,
          defaultTags: settings.default_tags,
          accountEquity: settings.account_equity,
          // Trade grouping settings
          enableTradeGrouping: settings.enable_trade_grouping,
          tradeGroupingTimeGapMinutes: settings.trade_grouping_time_gap_minutes,
          // Default broker
          defaultBroker: settings.default_broker,
          // AI provider settings
          aiProvider: settings.ai_provider,
          aiApiKey: settings.ai_api_key,
          aiApiUrl: settings.ai_api_url,
          aiModel: settings.ai_model,
          // Stop loss setting
          defaultStopLossPercent: settings.default_stop_loss_percent,
          // Analytics chart layout
          analyticsChartLayout: settings.analytics_chart_layout,
          // Auto-close expired options
          autoCloseExpiredOptions: settings.auto_close_expired_options
        } : null,
        tradingProfile: settings ? {
          tradingStrategies: settings.trading_strategies || [],
          tradingStyles: settings.trading_styles || [],
          riskTolerance: settings.risk_tolerance || 'moderate',
          primaryMarkets: settings.primary_markets || [],
          experienceLevel: settings.experience_level || 'intermediate',
          averagePositionSize: settings.average_position_size || 'medium',
          tradingGoals: settings.trading_goals || [],
          preferredSectors: settings.preferred_sectors || []
        } : null,
        // Complete trade export with ALL fields
        trades: trades.map(trade => ({
          // Original trade ID for linking diary entries
          originalId: trade.id,
          // Basic trade info
          symbol: trade.symbol,
          side: trade.side,
          quantity: trade.quantity,
          entryPrice: trade.entry_price,
          exitPrice: trade.exit_price,
          entryTime: trade.entry_time,
          exitTime: trade.exit_time,
          tradeDate: trade.trade_date,
          // P&L fields - preserve exactly as stored
          pnl: trade.pnl,
          pnlPercent: trade.pnl_percent,
          // Commission fields
          commission: trade.commission,
          entryCommission: trade.entry_commission,
          exitCommission: trade.exit_commission,
          fees: trade.fees,
          // Broker
          broker: trade.broker,
          // Strategy and setup
          strategy: trade.strategy,
          setup: trade.setup,
          strategyConfidence: trade.strategy_confidence,
          classificationMethod: trade.classification_method,
          classificationMetadata: trade.classification_metadata,
          manualOverride: trade.manual_override,
          // Risk management
          stopLoss: trade.stop_loss,
          takeProfit: trade.take_profit,
          rValue: trade.r_value,
          // Quality metrics
          qualityGrade: trade.quality_grade,
          qualityScore: trade.quality_score,
          qualityMetrics: trade.quality_metrics,
          // Execution data
          executions: trade.executions,
          // MAE/MFE
          mae: trade.mae,
          mfe: trade.mfe,
          // Confidence
          confidence: trade.confidence,
          // Chart URL
          chartUrl: trade.chart_url,
          // Notes and tags
          notes: trade.notes,
          tags: trade.tags,
          isPublic: trade.is_public,
          // Instrument type fields
          instrumentType: trade.instrument_type,
          strikePrice: trade.strike_price,
          expirationDate: trade.expiration_date,
          optionType: trade.option_type,
          contractSize: trade.contract_size,
          underlyingSymbol: trade.underlying_symbol,
          contractMonth: trade.contract_month,
          contractYear: trade.contract_year,
          tickSize: trade.tick_size,
          pointValue: trade.point_value,
          underlyingAsset: trade.underlying_asset,
          // News data
          newsEvents: trade.news_events,
          hasNews: trade.has_news,
          newsSentiment: trade.news_sentiment,
          newsCheckedAt: trade.news_checked_at,
          // Health data
          heartRate: trade.heart_rate,
          sleepScore: trade.sleep_score,
          sleepHours: trade.sleep_hours,
          stressLevel: trade.stress_level,
          // Auto-close tracking
          autoClosed: trade.auto_closed,
          autoCloseReason: trade.auto_close_reason,
          // Currency fields
          originalCurrency: trade.original_currency,
          exchangeRate: trade.exchange_rate,
          originalEntryPriceCurrency: trade.original_entry_price_currency,
          originalExitPriceCurrency: trade.original_exit_price_currency,
          originalPnlCurrency: trade.original_pnl_currency,
          originalCommissionCurrency: trade.original_commission_currency,
          originalFeesCurrency: trade.original_fees_currency,
          // Import tracking
          importId: trade.import_id,
          // Enrichment status
          enrichmentStatus: trade.enrichment_status,
          enrichmentCompletedAt: trade.enrichment_completed_at,
          // Timestamps
          createdAt: trade.created_at,
          updatedAt: trade.updated_at
        })),
        tags: tags.map(tag => ({
          name: tag.name,
          color: tag.color
        })),
        equityHistory: equityHistory.map(equity => ({
          date: equity.date,
          equity: equity.equity,
          pnl: equity.pnl
        })),
        // Diary entries with original trade IDs preserved
        diaryEntries: diaryEntries.map(entry => ({
          originalId: entry.id,
          entryDate: entry.entry_date,
          title: entry.title,
          content: entry.content,
          entryType: entry.entry_type,
          marketBias: entry.market_bias,
          keyLevels: entry.key_levels,
          watchlist: entry.watchlist,
          followedPlan: entry.followed_plan,
          lessonsLearned: entry.lessons_learned,
          linkedTrades: entry.linked_trades,
          tags: entry.tags,
          createdAt: entry.created_at,
          updatedAt: entry.updated_at
        })),
        // Diary templates (NEW in v2.0)
        diaryTemplates: diaryTemplates.map(template => ({
          name: template.name,
          description: template.description,
          entryType: template.entry_type,
          title: template.title,
          content: template.content,
          marketBias: template.market_bias,
          keyLevels: template.key_levels,
          watchlist: template.watchlist,
          tags: template.tags,
          isDefault: template.is_default,
          useCount: template.use_count,
          createdAt: template.created_at,
          updatedAt: template.updated_at
        })),
        // Broker fee settings (NEW in v2.0)
        brokerFeeSettings: brokerFeeSettings.map(setting => ({
          broker: setting.broker,
          instrument: setting.instrument,
          commissionPerContract: setting.commission_per_contract,
          commissionPerSide: setting.commission_per_side,
          exchangeFeePerContract: setting.exchange_fee_per_contract,
          nfaFeePerContract: setting.nfa_fee_per_contract,
          clearingFeePerContract: setting.clearing_fee_per_contract,
          platformFeePerContract: setting.platform_fee_per_contract,
          notes: setting.notes,
          createdAt: setting.created_at,
          updatedAt: setting.updated_at
        }))
      };

      console.log('[EXPORT] Export complete. Total trades:', trades.length,
                  'Diary entries:', diaryEntries.length,
                  'Templates:', diaryTemplates.length,
                  'Broker fees:', brokerFeeSettings.length);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=tradetally-export-${new Date().toISOString().split('T')[0]}.json`);
      res.json(exportData);
    } catch (error) {
      console.error('[EXPORT] Export failed:', error);
      next(error);
    }
  },

  async importUserData(req, res, next) {
    try {
      console.log('[IMPORT] Import request received:', req.file ? 'File present' : 'No file');
      const userId = req.user.id;
      const file = req.file;

      if (!file) {
        console.log('[IMPORT] No file uploaded in request');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      console.log('[IMPORT] File details:', { name: file.originalname, size: file.size, mimetype: file.mimetype });
      console.log('[IMPORT] User ID:', userId);

      let importData;
      try {
        importData = JSON.parse(file.buffer.toString());
        console.log('[IMPORT] JSON parsed successfully, keys:', Object.keys(importData));
        console.log('[IMPORT] Export version:', importData.exportVersion);
        console.log('[IMPORT] Number of trades in file:', importData.trades?.length || 0);
        console.log('[IMPORT] Number of tags in file:', importData.tags?.length || 0);
        console.log('[IMPORT] Number of diary entries in file:', importData.diaryEntries?.length || 0);
        console.log('[IMPORT] Number of templates in file:', importData.diaryTemplates?.length || 0);
        console.log('[IMPORT] Number of broker fees in file:', importData.brokerFeeSettings?.length || 0);
      } catch (error) {
        console.error('[IMPORT] JSON parse error:', error);
        return res.status(400).json({ error: 'Invalid JSON file' });
      }

      // Validate import data structure
      if (!importData.exportVersion || !importData.trades) {
        console.log('[IMPORT] Invalid export structure:', {
          hasVersion: !!importData.exportVersion,
          hasTrades: !!importData.trades,
          keys: Object.keys(importData)
        });
        return res.status(400).json({ error: 'Invalid TradeTally export file' });
      }

      // Ensure database schema is ready before import
      try {
        const tableCheckQuery = `
          SELECT
            EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'trades') as has_trades,
            EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tags') as has_tags,
            EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users') as has_users
        `;
        const tableCheck = await db.query(tableCheckQuery);

        if (!tableCheck.rows[0].has_trades || !tableCheck.rows[0].has_tags || !tableCheck.rows[0].has_users) {
          console.error('[IMPORT] Database schema not ready:', tableCheck.rows[0]);
          return res.status(500).json({
            error: 'Database schema not initialized. Please restart the application to run migrations first.',
            details: 'The database tables required for import do not exist yet.'
          });
        }
      } catch (schemaError) {
        console.error('[IMPORT] Schema check failed:', schemaError);
        return res.status(500).json({
          error: 'Unable to verify database schema',
          details: schemaError.message
        });
      }

      console.log('[IMPORT] Starting database connection...');
      const client = await db.connect();
      console.log('[IMPORT] Database connection established');

      // Counters for import results
      let tradesAdded = 0;
      let tradesSkipped = 0;
      let tagsAdded = 0;
      let equityAdded = 0;
      let diaryAdded = 0;
      let diarySkipped = 0;
      let templatesAdded = 0;
      let templatesSkipped = 0;
      let brokerFeesAdded = 0;
      let brokerFeesSkipped = 0;

      // Map old trade IDs to new trade IDs for diary entry linked_trades
      const tradeIdMap = new Map();

      try {
        console.log('[IMPORT] Starting database transaction...');
        await client.query('BEGIN');

        // ============================================
        // 1. Import tags first (needed for trades)
        // ============================================
        if (importData.tags && importData.tags.length > 0) {
          console.log(`[IMPORT] Processing ${importData.tags.length} tags...`);
          for (const tag of importData.tags) {
            try {
              const existingTag = await client.query(
                `SELECT id FROM tags WHERE user_id = $1 AND name = $2`,
                [userId, tag.name]
              );

              if (existingTag.rows.length === 0) {
                await client.query(
                  `INSERT INTO tags (user_id, name, color) VALUES ($1, $2, $3)`,
                  [userId, tag.name, tag.color]
                );
                tagsAdded++;
              }
            } catch (tagError) {
              console.error('[IMPORT] Error processing tag:', tag, tagError);
              throw tagError;
            }
          }
          console.log(`[IMPORT] Tags: ${tagsAdded} added`);
        }

        // ============================================
        // 2. Import trades with ALL fields
        // ============================================
        if (importData.trades && importData.trades.length > 0) {
          console.log(`[IMPORT] Processing ${importData.trades.length} trades with complete data...`);

          for (let i = 0; i < importData.trades.length; i++) {
            const trade = importData.trades[i];
            try {
              // Check if trade already exists - use entry_time as the unique identifier
              // (more reliable than created_at for cross-user imports)
              // Handle NULL entry_time properly using IS NOT DISTINCT FROM
              const existingTrade = await client.query(
                `SELECT id FROM trades
                 WHERE user_id = $1
                 AND symbol = $2
                 AND side = $3
                 AND quantity = $4
                 AND entry_price = $5
                 AND (entry_time IS NOT DISTINCT FROM $6)`,
                [userId, trade.symbol, trade.side, trade.quantity, trade.entryPrice, trade.entryTime || null]
              );

              if (existingTrade.rows.length === 0) {
                // Insert trade with ALL fields - preserving P&L exactly as exported
                const result = await client.query(
                  `INSERT INTO trades (
                    user_id, symbol, side, quantity, entry_price, exit_price,
                    entry_time, exit_time, trade_date,
                    pnl, pnl_percent,
                    commission, entry_commission, exit_commission, fees,
                    broker, strategy, setup,
                    strategy_confidence, classification_method, classification_metadata, manual_override,
                    stop_loss, take_profit, r_value,
                    quality_grade, quality_score, quality_metrics,
                    executions, mae, mfe, confidence, chart_url,
                    notes, tags, is_public,
                    instrument_type, strike_price, expiration_date, option_type,
                    contract_size, underlying_symbol, contract_month, contract_year,
                    tick_size, point_value, underlying_asset,
                    news_events, has_news, news_sentiment, news_checked_at,
                    heart_rate, sleep_score, sleep_hours, stress_level,
                    auto_closed, auto_close_reason,
                    original_currency, exchange_rate,
                    original_entry_price_currency, original_exit_price_currency,
                    original_pnl_currency, original_commission_currency, original_fees_currency,
                    import_id, enrichment_status, enrichment_completed_at,
                    created_at, updated_at
                  ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    $7, $8, $9,
                    $10, $11,
                    $12, $13, $14, $15,
                    $16, $17, $18,
                    $19, $20, $21, $22,
                    $23, $24, $25,
                    $26, $27, $28,
                    $29, $30, $31, $32, $33,
                    $34, $35, $36,
                    $37, $38, $39, $40,
                    $41, $42, $43, $44,
                    $45, $46, $47,
                    $48, $49, $50, $51,
                    $52, $53, $54, $55,
                    $56, $57,
                    $58, $59,
                    $60, $61,
                    $62, $63, $64,
                    $65, $66, $67,
                    $68, $69
                  ) RETURNING id`,
                  [
                    userId, trade.symbol, trade.side, trade.quantity, trade.entryPrice, trade.exitPrice,
                    trade.entryTime, trade.exitTime, trade.tradeDate || (trade.entryTime ? trade.entryTime.split('T')[0] : null),
                    trade.pnl, trade.pnlPercent,
                    trade.commission || 0, trade.entryCommission || 0, trade.exitCommission || 0, trade.fees || 0,
                    trade.broker, trade.strategy, trade.setup,
                    trade.strategyConfidence, trade.classificationMethod,
                    trade.classificationMetadata ? JSON.stringify(trade.classificationMetadata) : null,
                    trade.manualOverride || false,
                    trade.stopLoss, trade.takeProfit, trade.rValue,
                    trade.qualityGrade, trade.qualityScore,
                    trade.qualityMetrics ? JSON.stringify(trade.qualityMetrics) : null,
                    trade.executions ? JSON.stringify(trade.executions) : null,
                    trade.mae, trade.mfe, trade.confidence || 5, trade.chartUrl,
                    trade.notes, trade.tags || [], trade.isPublic || false,
                    trade.instrumentType || 'stock', trade.strikePrice, trade.expirationDate, trade.optionType,
                    trade.contractSize, trade.underlyingSymbol, trade.contractMonth, trade.contractYear,
                    trade.tickSize, trade.pointValue, trade.underlyingAsset,
                    trade.newsEvents ? JSON.stringify(trade.newsEvents) : '[]',
                    trade.hasNews || false, trade.newsSentiment, trade.newsCheckedAt,
                    trade.heartRate, trade.sleepScore, trade.sleepHours, trade.stressLevel,
                    trade.autoClosed || false, trade.autoCloseReason,
                    trade.originalCurrency || 'USD', trade.exchangeRate || 1.0,
                    trade.originalEntryPriceCurrency, trade.originalExitPriceCurrency,
                    trade.originalPnlCurrency, trade.originalCommissionCurrency, trade.originalFeesCurrency,
                    null, // import_id set to null - original import_id won't exist in target database
                    trade.enrichmentStatus || 'completed', trade.enrichmentCompletedAt,
                    trade.createdAt || new Date(), trade.updatedAt || new Date()
                  ]
                );

                // Map old ID to new ID for diary entry linking
                if (trade.originalId && result.rows[0]) {
                  tradeIdMap.set(trade.originalId, result.rows[0].id);
                }

                tradesAdded++;
              } else {
                // Map existing trade ID for diary entry linking
                if (trade.originalId) {
                  tradeIdMap.set(trade.originalId, existingTrade.rows[0].id);
                }
                tradesSkipped++;
              }
            } catch (tradeError) {
              console.error('[IMPORT] Error processing trade:', trade.symbol, tradeError.message);
              throw tradeError;
            }
          }
          console.log(`[IMPORT] Trades: ${tradesAdded} added, ${tradesSkipped} skipped`);
          console.log(`[IMPORT] Trade ID mappings created: ${tradeIdMap.size}`);
        }

        // ============================================
        // 3. Import/Update user settings with ALL fields
        // ============================================
        if (importData.settings || importData.tradingProfile) {
          console.log('[IMPORT] Processing user settings...');
          const existingSettings = await client.query(
            `SELECT * FROM user_settings WHERE user_id = $1`,
            [userId]
          );

          const s = importData.settings || {};
          const tp = importData.tradingProfile || {};

          if (existingSettings.rows.length === 0) {
            // Create new settings with ALL imported data
            await client.query(
              `INSERT INTO user_settings (
                user_id, email_notifications, public_profile, default_tags, account_equity,
                trading_strategies, trading_styles, risk_tolerance, primary_markets,
                experience_level, average_position_size, trading_goals, preferred_sectors,
                enable_trade_grouping, trade_grouping_time_gap_minutes,
                default_broker, ai_provider, ai_api_key, ai_api_url, ai_model,
                default_stop_loss_percent, analytics_chart_layout, auto_close_expired_options
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)`,
              [
                userId,
                s.emailNotifications ?? true,
                s.publicProfile ?? false,
                s.defaultTags || [],
                s.accountEquity || null,
                tp.tradingStrategies || [],
                tp.tradingStyles || [],
                tp.riskTolerance || 'moderate',
                tp.primaryMarkets || [],
                tp.experienceLevel || 'intermediate',
                tp.averagePositionSize || 'medium',
                tp.tradingGoals || [],
                tp.preferredSectors || [],
                s.enableTradeGrouping ?? true,
                s.tradeGroupingTimeGapMinutes || 60,
                s.defaultBroker || null,
                s.aiProvider || null,
                s.aiApiKey || null,
                s.aiApiUrl || null,
                s.aiModel || null,
                s.defaultStopLossPercent || null,
                s.analyticsChartLayout ? JSON.stringify(s.analyticsChartLayout) : null,
                s.autoCloseExpiredOptions ?? false
              ]
            );
            console.log('[IMPORT] Created new user settings');
          } else {
            // Update existing settings with imported values
            const updates = [];
            const values = [];
            let paramCount = 1;

            // Settings fields
            if (s.defaultTags) {
              const mergedTags = [...new Set([
                ...(existingSettings.rows[0].default_tags || []),
                ...(s.defaultTags || [])
              ])];
              updates.push(`default_tags = $${paramCount++}`);
              values.push(mergedTags);
            }
            if (s.enableTradeGrouping !== undefined) {
              updates.push(`enable_trade_grouping = $${paramCount++}`);
              values.push(s.enableTradeGrouping);
            }
            if (s.tradeGroupingTimeGapMinutes !== undefined) {
              updates.push(`trade_grouping_time_gap_minutes = $${paramCount++}`);
              values.push(s.tradeGroupingTimeGapMinutes);
            }
            if (s.defaultBroker) {
              updates.push(`default_broker = $${paramCount++}`);
              values.push(s.defaultBroker);
            }
            if (s.aiProvider) {
              updates.push(`ai_provider = $${paramCount++}`);
              values.push(s.aiProvider);
            }
            if (s.aiApiKey) {
              updates.push(`ai_api_key = $${paramCount++}`);
              values.push(s.aiApiKey);
            }
            if (s.aiApiUrl) {
              updates.push(`ai_api_url = $${paramCount++}`);
              values.push(s.aiApiUrl);
            }
            if (s.aiModel) {
              updates.push(`ai_model = $${paramCount++}`);
              values.push(s.aiModel);
            }
            if (s.defaultStopLossPercent !== undefined) {
              updates.push(`default_stop_loss_percent = $${paramCount++}`);
              values.push(s.defaultStopLossPercent);
            }
            if (s.analyticsChartLayout) {
              updates.push(`analytics_chart_layout = $${paramCount++}`);
              values.push(JSON.stringify(s.analyticsChartLayout));
            }
            if (s.autoCloseExpiredOptions !== undefined) {
              updates.push(`auto_close_expired_options = $${paramCount++}`);
              values.push(s.autoCloseExpiredOptions);
            }

            // Trading profile fields
            if (tp.tradingStrategies) {
              updates.push(`trading_strategies = $${paramCount++}`);
              values.push(tp.tradingStrategies);
            }
            if (tp.tradingStyles) {
              updates.push(`trading_styles = $${paramCount++}`);
              values.push(tp.tradingStyles);
            }
            if (tp.riskTolerance) {
              updates.push(`risk_tolerance = $${paramCount++}`);
              values.push(tp.riskTolerance);
            }
            if (tp.primaryMarkets) {
              updates.push(`primary_markets = $${paramCount++}`);
              values.push(tp.primaryMarkets);
            }
            if (tp.experienceLevel) {
              updates.push(`experience_level = $${paramCount++}`);
              values.push(tp.experienceLevel);
            }
            if (tp.averagePositionSize) {
              updates.push(`average_position_size = $${paramCount++}`);
              values.push(tp.averagePositionSize);
            }
            if (tp.tradingGoals) {
              updates.push(`trading_goals = $${paramCount++}`);
              values.push(tp.tradingGoals);
            }
            if (tp.preferredSectors) {
              updates.push(`preferred_sectors = $${paramCount++}`);
              values.push(tp.preferredSectors);
            }

            if (updates.length > 0) {
              values.push(userId);
              await client.query(
                `UPDATE user_settings SET ${updates.join(', ')} WHERE user_id = $${paramCount}`,
                values
              );
              console.log(`[IMPORT] Updated ${updates.length} user settings fields`);
            }
          }
        }

        // ============================================
        // 4. Import broker fee settings
        // ============================================
        if (importData.brokerFeeSettings && importData.brokerFeeSettings.length > 0) {
          console.log(`[IMPORT] Processing ${importData.brokerFeeSettings.length} broker fee settings...`);
          for (const setting of importData.brokerFeeSettings) {
            try {
              // Use upsert to handle both new and existing settings
              const result = await client.query(
                `INSERT INTO broker_fee_settings (
                  user_id, broker, instrument,
                  commission_per_contract, commission_per_side,
                  exchange_fee_per_contract, nfa_fee_per_contract,
                  clearing_fee_per_contract, platform_fee_per_contract,
                  notes, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (user_id, broker, instrument) DO UPDATE SET
                  commission_per_contract = EXCLUDED.commission_per_contract,
                  commission_per_side = EXCLUDED.commission_per_side,
                  exchange_fee_per_contract = EXCLUDED.exchange_fee_per_contract,
                  nfa_fee_per_contract = EXCLUDED.nfa_fee_per_contract,
                  clearing_fee_per_contract = EXCLUDED.clearing_fee_per_contract,
                  platform_fee_per_contract = EXCLUDED.platform_fee_per_contract,
                  notes = EXCLUDED.notes,
                  updated_at = EXCLUDED.updated_at
                RETURNING (xmax = 0) as inserted`,
                [
                  userId, setting.broker, setting.instrument || '',
                  setting.commissionPerContract || 0, setting.commissionPerSide || 0,
                  setting.exchangeFeePerContract || 0, setting.nfaFeePerContract || 0,
                  setting.clearingFeePerContract || 0, setting.platformFeePerContract || 0,
                  setting.notes || '',
                  setting.createdAt || new Date(), setting.updatedAt || new Date()
                ]
              );
              if (result.rows[0].inserted) {
                brokerFeesAdded++;
              } else {
                brokerFeesSkipped++;
              }
            } catch (feeError) {
              console.error('[IMPORT] Error processing broker fee:', setting, feeError);
              // Continue with other settings
            }
          }
          console.log(`[IMPORT] Broker fees: ${brokerFeesAdded} added, ${brokerFeesSkipped} updated`);
        }

        // ============================================
        // 5. Import diary templates
        // ============================================
        if (importData.diaryTemplates && importData.diaryTemplates.length > 0) {
          console.log(`[IMPORT] Processing ${importData.diaryTemplates.length} diary templates...`);
          for (const template of importData.diaryTemplates) {
            try {
              // Check if template with same name exists
              const existingTemplate = await client.query(
                `SELECT id FROM diary_templates WHERE user_id = $1 AND name = $2`,
                [userId, template.name]
              );

              if (existingTemplate.rows.length === 0) {
                await client.query(
                  `INSERT INTO diary_templates (
                    user_id, name, description, entry_type, title, content,
                    market_bias, key_levels, watchlist, tags,
                    is_default, use_count, created_at, updated_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                  [
                    userId, template.name, template.description, template.entryType || 'diary',
                    template.title, template.content,
                    template.marketBias, template.keyLevels, template.watchlist || [], template.tags || [],
                    template.isDefault || false, template.useCount || 0,
                    template.createdAt || new Date(), template.updatedAt || new Date()
                  ]
                );
                templatesAdded++;
              } else {
                templatesSkipped++;
              }
            } catch (templateError) {
              console.error('[IMPORT] Error processing diary template:', template.name, templateError);
              // Continue with other templates
            }
          }
          console.log(`[IMPORT] Templates: ${templatesAdded} added, ${templatesSkipped} skipped`);
        }

        // ============================================
        // 6. Import equity history
        // ============================================
        if (importData.equityHistory && importData.equityHistory.length > 0) {
          console.log(`[IMPORT] Processing ${importData.equityHistory.length} equity records...`);
          for (const equity of importData.equityHistory) {
            try {
              await client.query(
                `INSERT INTO equity_history (user_id, date, equity, pnl)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (user_id, date) DO NOTHING`,
                [userId, equity.date, equity.equity, equity.pnl || 0.00]
              );
              equityAdded++;
            } catch (error) {
              // Try equity_snapshots as fallback
              try {
                await client.query(
                  `INSERT INTO equity_snapshots (user_id, snapshot_date, equity_amount)
                   VALUES ($1, $2, $3)
                   ON CONFLICT (user_id, snapshot_date) DO NOTHING`,
                  [userId, equity.date, equity.equity]
                );
                equityAdded++;
              } catch (snapshotError) {
                console.warn('[IMPORT] No equity tracking tables found');
              }
            }
          }
          console.log(`[IMPORT] Equity records: ${equityAdded} added`);
        }

        // ============================================
        // 7. Import diary entries with trade ID remapping
        // ============================================
        if (importData.diaryEntries && importData.diaryEntries.length > 0) {
          console.log(`[IMPORT] Processing ${importData.diaryEntries.length} diary entries...`);
          for (const entry of importData.diaryEntries) {
            try {
              // Check if entry already exists
              const existingEntry = await client.query(
                `SELECT id FROM diary_entries
                 WHERE user_id = $1
                 AND entry_date = $2
                 AND created_at = $3`,
                [userId, entry.entryDate, entry.createdAt]
              );

              if (existingEntry.rows.length === 0) {
                // Remap linked trade IDs to new IDs
                let remappedLinkedTrades = [];
                if (entry.linkedTrades && entry.linkedTrades.length > 0) {
                  for (const oldTradeId of entry.linkedTrades) {
                    const newTradeId = tradeIdMap.get(oldTradeId);
                    if (newTradeId) {
                      remappedLinkedTrades.push(newTradeId);
                    }
                  }
                  console.log(`[IMPORT] Remapped ${remappedLinkedTrades.length}/${entry.linkedTrades.length} linked trades for diary entry`);
                }

                await client.query(
                  `INSERT INTO diary_entries (
                    user_id, entry_date, title, content, entry_type,
                    market_bias, key_levels, watchlist, followed_plan,
                    lessons_learned, linked_trades, tags, created_at, updated_at
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                  [
                    userId,
                    entry.entryDate,
                    entry.title,
                    entry.content,
                    entry.entryType || 'diary',
                    entry.marketBias,
                    entry.keyLevels,
                    entry.watchlist || [],
                    entry.followedPlan,
                    entry.lessonsLearned,
                    remappedLinkedTrades,
                    entry.tags || [],
                    entry.createdAt || new Date(),
                    entry.updatedAt || new Date()
                  ]
                );
                diaryAdded++;
              } else {
                diarySkipped++;
              }
            } catch (diaryError) {
              console.error('[IMPORT] Error processing diary entry:', entry.title, diaryError);
              // Continue with other entries
            }
          }
          console.log(`[IMPORT] Diary entries: ${diaryAdded} added, ${diarySkipped} skipped`);
        }

        await client.query('COMMIT');
        console.log('[IMPORT] Transaction committed successfully');

        res.json({
          success: true,
          tradesAdded,
          tradesSkipped,
          tagsAdded,
          equityAdded,
          diaryAdded,
          diarySkipped,
          templatesAdded,
          templatesSkipped,
          brokerFeesAdded,
          brokerFeesSkipped,
          message: `Successfully imported: ${tradesAdded} trades, ${tagsAdded} tags, ${equityAdded} equity records, ${diaryAdded} diary entries, ${templatesAdded} templates, ${brokerFeesAdded} broker fee settings. Skipped: ${tradesSkipped} trades, ${diarySkipped} diary entries, ${templatesSkipped} templates, ${brokerFeesSkipped} broker fees (updated).`
        });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('[IMPORT] Transaction rolled back due to error');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('[IMPORT] Import error:', error);
      console.error('[IMPORT] Stack trace:', error.stack);
      res.status(500).json({ error: 'Import failed', message: error.message });
    }
  },

  // Admin Settings Endpoints
  async getAdminAISettings(req, res, next) {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const settings = await adminSettingsService.getDefaultAISettings();
      
      res.json({
        aiProvider: settings.provider,
        aiApiKey: settings.apiKey ? '***' : '', // Mask the API key in response
        aiApiUrl: settings.apiUrl,
        aiModel: settings.model
      });
    } catch (error) {
      next(error);
    }
  },

  async updateAdminAISettings(req, res, next) {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { aiProvider, aiApiKey, aiApiUrl, aiModel } = req.body;

      // Validate AI provider
      const validProviders = ['gemini', 'claude', 'openai', 'ollama', 'lmstudio', 'perplexity', 'local'];
      if (aiProvider && !validProviders.includes(aiProvider)) {
        return res.status(400).json({ 
          error: 'Invalid AI provider. Must be one of: ' + validProviders.join(', ')
        });
      }

      // Validate required fields
      if (aiProvider && !['local', 'ollama', 'lmstudio'].includes(aiProvider) && !aiApiKey) {
        return res.status(400).json({ 
          error: 'API key is required for ' + aiProvider 
        });
      }

      if (['local', 'ollama', 'lmstudio'].includes(aiProvider) && !aiApiUrl) {
        return res.status(400).json({ 
          error: 'API URL is required for ' + aiProvider 
        });
      }

      const aiSettings = {
        provider: aiProvider,
        apiKey: aiApiKey,
        apiUrl: aiApiUrl,
        model: aiModel
      };

      const success = await adminSettingsService.updateDefaultAISettings(aiSettings);
      
      if (!success) {
        return res.status(500).json({ error: 'Failed to update admin AI settings' });
      }
      
      res.json({
        message: 'Admin AI provider settings updated successfully',
        aiProvider: aiProvider,
        aiApiKey: aiApiKey ? '***' : '', // Mask the API key in response
        aiApiUrl: aiApiUrl,
        aiModel: aiModel
      });
    } catch (error) {
      next(error);
    }
  },

  async getAllAdminSettings(req, res, next) {
    try {
      // Check if user is admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const settings = await adminSettingsService.getAllSettings();

      // Mask sensitive settings
      const maskedSettings = { ...settings };
      if (maskedSettings.default_ai_api_key) {
        maskedSettings.default_ai_api_key = '***';
      }

      res.json({ settings: maskedSettings });
    } catch (error) {
      next(error);
    }
  },

  // Broker Fee Settings
  async getBrokerFeeSettings(req, res, next) {
    try {
      const query = `
        SELECT
          id, broker, instrument,
          commission_per_contract,
          commission_per_side,
          exchange_fee_per_contract,
          nfa_fee_per_contract,
          clearing_fee_per_contract,
          platform_fee_per_contract,
          notes,
          created_at,
          updated_at
        FROM broker_fee_settings
        WHERE user_id = $1
        ORDER BY broker, instrument
      `;

      const result = await db.query(query, [req.user.id]);

      // Convert to camelCase
      const settings = result.rows.map(row => ({
        id: row.id,
        broker: row.broker,
        instrument: row.instrument || '',
        commissionPerContract: parseFloat(row.commission_per_contract) || 0,
        commissionPerSide: parseFloat(row.commission_per_side) || 0,
        exchangeFeePerContract: parseFloat(row.exchange_fee_per_contract) || 0,
        nfaFeePerContract: parseFloat(row.nfa_fee_per_contract) || 0,
        clearingFeePerContract: parseFloat(row.clearing_fee_per_contract) || 0,
        platformFeePerContract: parseFloat(row.platform_fee_per_contract) || 0,
        notes: row.notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));

      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  },

  async getBrokerFeeSettingByBroker(req, res, next) {
    try {
      const { broker } = req.params;
      const { instrument } = req.query;

      // If instrument is provided, try to find instrument-specific setting first
      // Then fall back to broker-wide default (instrument = '')
      let query;
      let params;

      if (instrument) {
        query = `
          SELECT
            id, broker, instrument,
            commission_per_contract,
            commission_per_side,
            exchange_fee_per_contract,
            nfa_fee_per_contract,
            clearing_fee_per_contract,
            platform_fee_per_contract,
            notes
          FROM broker_fee_settings
          WHERE user_id = $1 AND broker = $2 AND instrument IN ($3, '')
          ORDER BY CASE WHEN instrument = $3 THEN 0 ELSE 1 END
          LIMIT 1
        `;
        params = [req.user.id, broker, instrument.toUpperCase()];
      } else {
        query = `
          SELECT
            id, broker, instrument,
            commission_per_contract,
            commission_per_side,
            exchange_fee_per_contract,
            nfa_fee_per_contract,
            clearing_fee_per_contract,
            platform_fee_per_contract,
            notes
          FROM broker_fee_settings
          WHERE user_id = $1 AND broker = $2 AND instrument = ''
        `;
        params = [req.user.id, broker];
      }

      const result = await db.query(query, params);

      if (result.rows.length === 0) {
        return res.json({ success: true, data: null });
      }

      const row = result.rows[0];
      const setting = {
        id: row.id,
        broker: row.broker,
        instrument: row.instrument || '',
        commissionPerContract: parseFloat(row.commission_per_contract) || 0,
        commissionPerSide: parseFloat(row.commission_per_side) || 0,
        exchangeFeePerContract: parseFloat(row.exchange_fee_per_contract) || 0,
        nfaFeePerContract: parseFloat(row.nfa_fee_per_contract) || 0,
        clearingFeePerContract: parseFloat(row.clearing_fee_per_contract) || 0,
        platformFeePerContract: parseFloat(row.platform_fee_per_contract) || 0,
        notes: row.notes
      };

      res.json({ success: true, data: setting });
    } catch (error) {
      next(error);
    }
  },

  async upsertBrokerFeeSetting(req, res, next) {
    try {
      const {
        broker,
        instrument = '',
        commissionPerContract = 0,
        commissionPerSide = 0,
        exchangeFeePerContract = 0,
        nfaFeePerContract = 0,
        clearingFeePerContract = 0,
        platformFeePerContract = 0,
        notes = ''
      } = req.body;

      if (!broker || typeof broker !== 'string') {
        return res.status(400).json({ error: 'Broker name is required' });
      }

      console.log('[BROKER FEES] Saving broker fee settings:', {
        broker,
        instrument,
        userId: req.user?.id
      });

      const query = `
        INSERT INTO broker_fee_settings (
          user_id, broker, instrument,
          commission_per_contract, commission_per_side,
          exchange_fee_per_contract, nfa_fee_per_contract,
          clearing_fee_per_contract, platform_fee_per_contract,
          notes, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, broker, instrument) DO UPDATE SET
          commission_per_contract = EXCLUDED.commission_per_contract,
          commission_per_side = EXCLUDED.commission_per_side,
          exchange_fee_per_contract = EXCLUDED.exchange_fee_per_contract,
          nfa_fee_per_contract = EXCLUDED.nfa_fee_per_contract,
          clearing_fee_per_contract = EXCLUDED.clearing_fee_per_contract,
          platform_fee_per_contract = EXCLUDED.platform_fee_per_contract,
          notes = EXCLUDED.notes,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const result = await db.query(query, [
        req.user.id,
        broker.toLowerCase(),
        (instrument || '').toUpperCase(),
        commissionPerContract,
        commissionPerSide,
        exchangeFeePerContract,
        nfaFeePerContract,
        clearingFeePerContract,
        platformFeePerContract,
        notes
      ]);

      const row = result.rows[0];
      const setting = {
        id: row.id,
        broker: row.broker,
        instrument: row.instrument || '',
        commissionPerContract: parseFloat(row.commission_per_contract) || 0,
        commissionPerSide: parseFloat(row.commission_per_side) || 0,
        exchangeFeePerContract: parseFloat(row.exchange_fee_per_contract) || 0,
        nfaFeePerContract: parseFloat(row.nfa_fee_per_contract) || 0,
        clearingFeePerContract: parseFloat(row.clearing_fee_per_contract) || 0,
        platformFeePerContract: parseFloat(row.platform_fee_per_contract) || 0,
        notes: row.notes
      };

      res.json({ success: true, data: setting });
    } catch (error) {
      console.error('[BROKER FEES] Error saving broker fee settings:', error.message);
      console.error('[BROKER FEES] Stack:', error.stack);
      next(error);
    }
  },

  async deleteBrokerFeeSetting(req, res, next) {
    try {
      const { id } = req.params;

      const query = `
        DELETE FROM broker_fee_settings
        WHERE id = $1 AND user_id = $2
        RETURNING id
      `;

      const result = await db.query(query, [id, req.user.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Broker fee setting not found' });
      }

      res.json({ success: true, message: 'Broker fee setting deleted' });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = settingsController;