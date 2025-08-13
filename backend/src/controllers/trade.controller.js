const Trade = require('../models/Trade');
const { parseCSV } = require('../utils/csvParser');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');
const finnhub = require('../utils/finnhub');
const cache = require('../utils/cache');
const symbolCategories = require('../utils/symbolCategories');
const ChartService = require('../services/chartService');
const AnalyticsCache = require('../services/analyticsCache');

const tradeController = {
  async getUserTrades(req, res, next) {
    try {
      const { 
        symbol, startDate, endDate, tags, strategy, sector,
        strategies, sectors, // New multi-select parameters
        side, minPrice, maxPrice, minQuantity, maxQuantity,
        status, minPnl, maxPnl, pnlType, broker, hasNews,
        daysOfWeek, // New day of week filter
        limit = 50, offset = 0 
      } = req.query;
      
      const filters = {
        symbol,
        startDate,
        endDate,
        tags: tags ? tags.split(',') : undefined,
        strategy,
        sector,
        // Multi-select filters
        strategies: strategies ? strategies.split(',') : undefined,
        sectors: sectors ? sectors.split(',') : undefined,
        // New advanced filters
        side,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        minQuantity: minQuantity ? parseInt(minQuantity) : undefined,
        maxQuantity: maxQuantity ? parseInt(maxQuantity) : undefined,
        status,
        minPnl: minPnl ? parseFloat(minPnl) : undefined,
        maxPnl: maxPnl ? parseFloat(maxPnl) : undefined,
        pnlType,
        broker,
        hasNews,
        daysOfWeek: daysOfWeek ? daysOfWeek.split(',').map(d => parseInt(d)) : undefined,
        // Pagination
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      console.log('🔍 getUserTrades RAW QUERY:', req.query);
      console.log('🔍 getUserTrades PARSED filters:', JSON.stringify(filters, null, 2));
      
      // Debug empty hasNews
      if (req.query.hasNews === '') {
        console.log('⚠️ WARNING: hasNews is empty string, this may cause issues');
      }

      // Get trades with pagination
      const trades = await Trade.findByUser(req.user.id, filters);
      
      // Get total count of filtered trades
      const totalCountFilters = { ...filters };
      delete totalCountFilters.limit;
      delete totalCountFilters.offset;
      
      // Use Trade model method to get filtered count
      const total = await Trade.getCountWithFilters(req.user.id, totalCountFilters);
      
      res.json({
        trades,
        count: trades.length,
        total: total,
        limit: filters.limit,
        offset: filters.offset,
        totalPages: Math.ceil(total / filters.limit)
      });
    } catch (error) {
      next(error);
    }
  },

  async getRoundTripTrades(req, res, next) {
    try {
      const { 
        symbol, startDate, endDate, tags, strategy, sector,
        strategies, sectors, // Add multi-select parameters
        side, minPrice, maxPrice, minQuantity, maxQuantity,
        status, minPnl, maxPnl, pnlType, broker, hasNews,
        daysOfWeek, // New day of week filter
        limit = 50, offset = 0 
      } = req.query;
      
      const filters = {
        symbol,
        startDate,
        endDate,
        tags: tags ? tags.split(',') : undefined,
        strategy,
        sector,
        // Multi-select filters
        strategies: strategies ? strategies.split(',') : undefined,
        sectors: sectors ? sectors.split(',') : undefined,
        side,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        minQuantity: minQuantity ? parseInt(minQuantity) : undefined,
        maxQuantity: maxQuantity ? parseInt(maxQuantity) : undefined,
        status,
        minPnl: minPnl ? parseFloat(minPnl) : undefined,
        maxPnl: maxPnl ? parseFloat(maxPnl) : undefined,
        pnlType,
        broker,
        hasNews,
        daysOfWeek: daysOfWeek ? daysOfWeek.split(',').map(d => parseInt(d)) : undefined,
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      // Get round-trip trades
      const trades = await Trade.getRoundTripTrades(req.user.id, filters);
      
      // Get total count
      const totalCountFilters = { ...filters };
      delete totalCountFilters.limit;
      delete totalCountFilters.offset;
      
      const total = await Trade.getRoundTripTradeCount(req.user.id, totalCountFilters);
      
      res.json({
        trades,
        count: trades.length,
        total: total,
        limit: filters.limit,
        offset: filters.offset,
        totalPages: Math.ceil(total / filters.limit)
      });
    } catch (error) {
      next(error);
    }
  },

  async createTrade(req, res, next) {
    try {
      const trade = await Trade.create(req.user.id, req.body);
      
      // Invalidate sector performance cache for this user since new trade was added
      try {
        await cache.invalidate('sector_performance');
        console.log('✅ Sector performance cache invalidated after trade creation');
      } catch (cacheError) {
        console.warn('⚠️ Failed to invalidate sector performance cache:', cacheError.message);
      }

      // Invalidate behavioral analytics cache after trade creation
      try {
        await AnalyticsCache.invalidateUserCache(req.user.id, [
          'top_missed_trades',
          'overconfidence_analysis',
          'loss_aversion_analysis',
          'personality_analysis'
        ]);
        console.log('✅ Behavioral analytics cache invalidated after trade creation');
      } catch (cacheError) {
        console.warn('⚠️ Failed to invalidate behavioral analytics cache:', cacheError.message);
      }
      
      res.status(201).json({ trade });
    } catch (error) {
      next(error);
    }
  },

  async getTrade(req, res, next) {
    try {
      const userId = req.user?.id;
      const tradeId = req.params.id;
      let trade = null;
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      if (!uuidRegex.test(tradeId)) {
        return res.status(400).json({ error: 'Invalid trade ID format' });
      }
      
      // Try individual trade first
      trade = await Trade.findById(tradeId, userId);
      
      // If not found, try round-trip trade
      if (!trade && userId) {
        trade = await Trade.findRoundTripById(tradeId, userId);
      }
      
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Parse executions JSON if it exists
      if (trade.executions && typeof trade.executions === 'string') {
        try {
          trade.executions = JSON.parse(trade.executions);
        } catch (e) {
          console.warn('Failed to parse executions JSON:', e);
          trade.executions = [];
        }
      }

      res.json({ trade });
    } catch (error) {
      next(error);
    }
  },

  async updateTrade(req, res, next) {
    try {
      const trade = await Trade.update(req.params.id, req.user.id, req.body);
      
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Invalidate sector performance cache for this user since trade data changed
      try {
        await cache.invalidate('sector_performance');
        console.log('✅ Sector performance cache invalidated after trade update');
      } catch (cacheError) {
        console.warn('⚠️ Failed to invalidate sector performance cache:', cacheError.message);
      }

      // Invalidate behavioral analytics cache after trade update
      try {
        await AnalyticsCache.invalidateUserCache(req.user.id, [
          'top_missed_trades',
          'overconfidence_analysis',
          'loss_aversion_analysis',
          'personality_analysis'
        ]);
        console.log('✅ Behavioral analytics cache invalidated after trade update');
      } catch (cacheError) {
        console.warn('⚠️ Failed to invalidate behavioral analytics cache:', cacheError.message);
      }

      res.json({ trade });
    } catch (error) {
      next(error);
    }
  },

  async deleteTrade(req, res, next) {
    try {
      // Get the trade and ensure it belongs to the current user
      const trade = await Trade.findById(req.params.id, req.user.id);
      
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found or access denied' });
      }

      // Delete the trade
      const result = await Trade.delete(req.params.id, req.user.id);
      
      if (!result) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Invalidate sector performance cache for this user
      try {
        await cache.invalidate('sector_performance');
        console.log('✅ Sector performance cache invalidated after trade deletion');
      } catch (cacheError) {
        console.warn('⚠️ Failed to invalidate sector performance cache:', cacheError.message);
      }

      // Invalidate behavioral analytics cache after trade deletion
      try {
        await AnalyticsCache.invalidateUserCache(req.user.id, [
          'top_missed_trades',
          'overconfidence_analysis',
          'loss_aversion_analysis',
          'personality_analysis'
        ]);
        console.log('✅ Behavioral analytics cache invalidated after trade deletion');
      } catch (cacheError) {
        console.warn('⚠️ Failed to invalidate behavioral analytics cache:', cacheError.message);
      }

      res.json({ message: 'Trade deleted successfully' });
    } catch (error) {
      next(error);
    }
  },

  async bulkDeleteTrades(req, res, next) {
    try {
      const { tradeIds } = req.body;
      
      if (!tradeIds || !Array.isArray(tradeIds) || tradeIds.length === 0) {
        return res.status(400).json({ error: 'Trade IDs array is required' });
      }

      // Verify all trades belong to the user before deleting any
      const trades = await Promise.all(
        tradeIds.map(id => Trade.findById(id, req.user.id))
      );

      const invalidTrades = trades.filter(trade => !trade);
      if (invalidTrades.length > 0) {
        return res.status(404).json({ 
          error: 'One or more trades not found or access denied' 
        });
      }

      // Delete all trades
      const deleteResults = await Promise.all(
        tradeIds.map(id => Trade.delete(id, req.user.id))
      );

      const deletedCount = deleteResults.filter(result => result).length;

      // Invalidate sector performance cache for this user
      try {
        await cache.invalidate('sector_performance');
        console.log('✅ Sector performance cache invalidated after bulk trade deletion');
      } catch (cacheError) {
        console.warn('⚠️ Failed to invalidate sector performance cache:', cacheError.message);
      }

      // Invalidate behavioral analytics cache after bulk trade deletion
      try {
        await AnalyticsCache.invalidateUserCache(req.user.id, [
          'top_missed_trades',
          'overconfidence_analysis',
          'loss_aversion_analysis',
          'personality_analysis'
        ]);
        console.log('✅ Behavioral analytics cache invalidated after bulk trade deletion');
      } catch (cacheError) {
        console.warn('⚠️ Failed to invalidate behavioral analytics cache:', cacheError.message);
      }

      res.json({ 
        message: `${deletedCount} trade${deletedCount === 1 ? '' : 's'} deleted successfully`,
        deletedCount 
      });
    } catch (error) {
      next(error);
    }
  },

  async getPublicTrades(req, res, next) {
    try {
      const { symbol, username, limit = 20, offset = 0 } = req.query;
      
      const filters = {
        symbol,
        username,
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      const trades = await Trade.getPublicTrades(filters);
      
      res.json({
        trades,
        count: trades.length,
        limit: filters.limit,
        offset: filters.offset
      });
    } catch (error) {
      next(error);
    }
  },

  async uploadAttachment(req, res, next) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const trade = await Trade.findById(req.params.id, req.user.id);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      const fileUrl = `/uploads/${req.file.filename}`;
      const attachment = await Trade.addAttachment(req.params.id, {
        fileUrl,
        fileType: req.file.mimetype,
        fileName: req.file.originalname,
        fileSize: req.file.size
      });

      res.status(201).json({ attachment });
    } catch (error) {
      next(error);
    }
  },

  async deleteAttachment(req, res, next) {
    try {
      const result = await Trade.deleteAttachment(req.params.attachmentId, req.user.id);
      
      if (!result) {
        return res.status(404).json({ error: 'Attachment not found' });
      }

      res.json({ message: 'Attachment deleted successfully' });
    } catch (error) {
      next(error);
    }
  },

  async addComment(req, res, next) {
    try {
      const { comment } = req.body;

      if (!comment || comment.trim().length === 0) {
        return res.status(400).json({ error: 'Comment cannot be empty' });
      }

      const trade = await Trade.findById(req.params.id, req.user.id);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      const insertQuery = `
        INSERT INTO trade_comments (trade_id, user_id, comment)
        VALUES ($1, $2, $3)
        RETURNING *
      `;

      const insertResult = await db.query(insertQuery, [req.params.id, req.user.id, comment]);
      
      // Get the comment with user information
      const selectQuery = `
        SELECT tc.*, u.username, u.avatar_url
        FROM trade_comments tc
        JOIN users u ON tc.user_id = u.id
        WHERE tc.id = $1
      `;
      
      const selectResult = await db.query(selectQuery, [insertResult.rows[0].id]);
      
      // If this is a comment on someone else's public trade, trigger notification
      if (trade.user_id !== req.user.id && trade.is_public) {
        try {
          const notificationsController = require('./notifications.controller');
          const commentNotification = {
            id: insertResult.rows[0].id,
            type: 'trade_comment',
            symbol: trade.symbol,
            message: `${req.user.username} commented on your ${trade.symbol} trade`,
            comment_text: comment,
            trade_id: trade.id,
            created_at: new Date().toISOString()
          };
          
          // Send real-time notification if user is connected
          await notificationsController.sendNotificationToUser(trade.user_id, commentNotification);
        } catch (notifError) {
          console.warn('Failed to send comment notification:', notifError.message);
        }
      }
      
      res.status(201).json({ comment: selectResult.rows[0] });
    } catch (error) {
      next(error);
    }
  },

  async getComments(req, res, next) {
    try {
      const userId = req.user?.id;
      const tradeId = req.params.id;
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      if (!uuidRegex.test(tradeId)) {
        return res.status(400).json({ error: 'Invalid trade ID format' });
      }
      
      // Try individual trade first
      let trade = await Trade.findById(tradeId, userId);
      
      // If not found, try round-trip trade
      if (!trade && userId) {
        trade = await Trade.findRoundTripById(tradeId, userId);
      }
      
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      const query = `
        SELECT tc.*, u.username, u.avatar_url
        FROM trade_comments tc
        JOIN users u ON tc.user_id = u.id
        WHERE tc.trade_id = $1
        ORDER BY tc.created_at DESC
      `;

      const result = await db.query(query, [tradeId]);
      
      res.json({ comments: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async updateComment(req, res, next) {
    try {
      const { id: tradeId, commentId } = req.params;
      const { comment } = req.body;
      const userId = req.user.id;

      if (!comment || !comment.trim()) {
        return res.status(400).json({ error: 'Comment content is required' });
      }
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      if (!uuidRegex.test(tradeId)) {
        return res.status(400).json({ error: 'Invalid trade ID format' });
      }
      
      // Try individual trade first
      let trade = await Trade.findById(tradeId, userId);
      
      // If not found, try round-trip trade
      if (!trade) {
        trade = await Trade.findRoundTripById(tradeId, userId);
      }
      
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Check if comment exists and belongs to user
      const existingCommentQuery = `
        SELECT * FROM trade_comments 
        WHERE id = $1 AND trade_id = $2 AND user_id = $3
      `;
      const existingResult = await db.query(existingCommentQuery, [commentId, tradeId, userId]);
      
      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Comment not found or not authorized' });
      }

      // Update comment
      const updateQuery = `
        UPDATE trade_comments 
        SET comment = $1, edited_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING *
      `;
      const updateResult = await db.query(updateQuery, [comment.trim(), commentId]);

      // Get updated comment with user info
      const query = `
        SELECT tc.*, u.username, u.avatar_url
        FROM trade_comments tc
        JOIN users u ON tc.user_id = u.id
        WHERE tc.id = $1
      `;
      const result = await db.query(query, [commentId]);
      
      res.json({ comment: result.rows[0] });
    } catch (error) {
      next(error);
    }
  },

  async deleteComment(req, res, next) {
    try {
      const { id: tradeId, commentId } = req.params;
      const userId = req.user.id;
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      if (!uuidRegex.test(tradeId)) {
        return res.status(400).json({ error: 'Invalid trade ID format' });
      }
      
      // Try individual trade first
      let trade = await Trade.findById(tradeId, userId);
      
      // If not found, try round-trip trade
      if (!trade) {
        trade = await Trade.findRoundTripById(tradeId, userId);
      }
      
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Check if comment exists and belongs to user
      const existingCommentQuery = `
        SELECT * FROM trade_comments 
        WHERE id = $1 AND trade_id = $2 AND user_id = $3
      `;
      const existingResult = await db.query(existingCommentQuery, [commentId, tradeId, userId]);
      
      if (existingResult.rows.length === 0) {
        return res.status(404).json({ error: 'Comment not found or not authorized' });
      }

      // Delete comment
      const deleteQuery = `DELETE FROM trade_comments WHERE id = $1`;
      await db.query(deleteQuery, [commentId]);
      
      res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
      next(error);
    }
  },

  async importTrades(req, res, next) {
    try {
      console.log('=== IMPORT TRADES STARTED ===');
      console.log('User ID:', req.user.id);
      console.log('Request headers:', req.headers);
      console.log('Request body:', req.body);
      console.log('Request files:', req.files);
      console.log('Request file:', req.file);
      console.log('File info:', req.file ? {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        buffer: req.file.buffer ? `Buffer length: ${req.file.buffer.length}` : 'No buffer'
      } : 'No file');

      if (!req.file) {
        console.log('ERROR: No file found in request');
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const importId = uuidv4();
      const { broker = 'generic' } = req.body;
      
      console.log('Selected broker:', broker);
      console.log('Import ID:', importId);

      const insertQuery = `
        INSERT INTO import_logs (id, user_id, broker, file_name, status)
        VALUES ($1, $2, $3, $4, 'processing')
        RETURNING *
      `;

      const importLog = await db.query(insertQuery, [
        importId,
        req.user.id,
        broker,
        req.file.originalname
      ]);

      // Ensure import continues in background regardless of client connection
      process.nextTick(async () => {
        // Set up a timeout to prevent stuck imports
        const importTimeout = setTimeout(async () => {
          logger.logError(`Import ${importId} timed out after 10 minutes`);
          await db.query(`
            UPDATE import_logs
            SET status = 'failed', error_details = $1, completed_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [{ error: 'Import timeout after 10 minutes' }, importId]);
        }, 10 * 60 * 1000); // 10 minutes
        
        try {
          logger.logImport(`Starting import for user ${req.user.id}, broker: ${broker}, file: ${req.file.originalname}`);
          
          // Fetch existing open positions for context-aware parsing
          logger.logImport(`Fetching existing open positions for context-aware import...`);
          const openPositionsQuery = `
            SELECT id, symbol, side, quantity, entry_price, entry_time, trade_date, commission, broker, executions
            FROM trades 
            WHERE user_id = $1 
            AND exit_price IS NULL 
            AND exit_time IS NULL
            ORDER BY symbol, entry_time
          `;
          const openPositionsResult = await db.query(openPositionsQuery, [req.user.id]);
          
          // Convert to context format
          const existingPositions = {};
          openPositionsResult.rows.forEach(row => {
            existingPositions[row.symbol] = {
              id: row.id,
              symbol: row.symbol,
              side: row.side,
              quantity: parseInt(row.quantity),
              entryPrice: parseFloat(row.entry_price),
              entryTime: row.entry_time,
              tradeDate: row.trade_date,
              commission: parseFloat(row.commission) || 0,
              broker: row.broker,
              executions: row.executions || []  // FIXED: Include existing executions
            };
          });
          
          logger.logImport(`Found ${Object.keys(existingPositions).length} existing open positions`);
          Object.entries(existingPositions).forEach(([symbol, pos]) => {
            logger.logImport(`  ${symbol}: ${pos.side} ${pos.quantity} shares @ $${pos.entryPrice}`);
          });
          
          const parseResult = await parseCSV(req.file.buffer, broker, { existingPositions });
          
          // Handle both old format (array) and new format (object with trades and unresolvedCusips)
          const trades = Array.isArray(parseResult) ? parseResult : parseResult.trades;
          const unresolvedCusips = parseResult.unresolvedCusips || [];
          
          logger.logImport(`Parsed ${trades.length} trades from CSV`);
          
          let imported = 0;
          let failed = 0;
          let duplicates = 0;
          const failedTrades = [];
          
          // Clear timeout since we're proceeding normally
          clearTimeout(importTimeout);

          // Check for existing trades to avoid duplicates
          // Note: We don't filter by broker as the same trade could be imported from different broker files
          const existingTradesQuery = `
            SELECT symbol, entry_time, entry_price, exit_price, pnl, quantity, side 
            FROM trades 
            WHERE user_id = $1 
            AND trade_date >= $2
            AND trade_date <= $3
          `;

          // Get date range from trades
          const tradeDates = trades.map(t => new Date(t.tradeDate)).filter(d => !isNaN(d));
          const minDate = tradeDates.length > 0 ? new Date(Math.min(...tradeDates)) : new Date();
          const maxDate = tradeDates.length > 0 ? new Date(Math.max(...tradeDates)) : new Date();

          const existingTrades = await db.query(existingTradesQuery, [
            req.user.id, 
            minDate.toISOString().split('T')[0],
            maxDate.toISOString().split('T')[0]
          ]);

          logger.logImport(`Found ${existingTrades.rows.length} existing trades in date range`);

          logger.logImport(`Processing ${trades.length} trades for import...`);
          
          for (const tradeData of trades) {
            try {
              // Minimal logging to avoid slowdowns
              
              // Check for duplicates based on entry price, exit price, and P/L
              // This is more reliable than symbol matching as symbols can be resolved differently
              // (e.g., CUSIP lookups may resolve to different symbols on different imports)
              // Using price and P/L matching prevents duplicate trades from being imported
              const isDuplicate = existingTrades.rows.some(existing => {
                // For closed trades, check entry, exit, and P/L
                if (tradeData.exitPrice && existing.exit_price) {
                  const entryMatch = Math.abs(parseFloat(existing.entry_price) - parseFloat(tradeData.entryPrice)) < 0.01;
                  const exitMatch = Math.abs(parseFloat(existing.exit_price) - parseFloat(tradeData.exitPrice)) < 0.01;
                  const pnlMatch = Math.abs(parseFloat(existing.pnl || 0) - parseFloat(tradeData.pnl || 0)) < 0.01; // $0.01 tolerance for P/L consistency
                  
                  return entryMatch && exitMatch && pnlMatch;
                }
                // For open trades, check entry price, quantity, and side
                else if (!tradeData.exitPrice && !existing.exit_price) {
                  return (
                    Math.abs(parseFloat(existing.entry_price) - parseFloat(tradeData.entryPrice)) < 0.01 &&
                    existing.quantity === tradeData.quantity &&
                    existing.side === tradeData.side &&
                    Math.abs(new Date(existing.entry_time) - new Date(tradeData.entryTime)) < 60000 // Within 1 minute
                  );
                }
                return false;
              });

              if (isDuplicate) {
                if (tradeData.exitPrice) {
                  logger.logImport(`Skipping duplicate trade: Entry: $${tradeData.entryPrice}, Exit: $${tradeData.exitPrice}, P/L: $${tradeData.pnl || 0} (Symbol: ${tradeData.symbol})`);
                } else {
                  logger.logImport(`Skipping duplicate open position: ${tradeData.symbol} ${tradeData.quantity} at $${tradeData.entryPrice}`);
                }
                duplicates++;
                continue;
              }

              if (imported % 50 === 0) {
                logger.logImport(`Importing trade ${imported + 1}: ${tradeData.symbol} ${tradeData.side} ${tradeData.quantity} at ${tradeData.entryPrice}`);
                
                // Update progress in database every 50 trades
                await db.query(`
                  UPDATE import_logs
                  SET trades_imported = $1
                  WHERE id = $2
                `, [imported, importId]);
              }
              // Handle updates to existing positions vs creating new trades
              if (tradeData.isUpdate && tradeData.existingTradeId) {
                logger.logImport(`Updating existing trade ${tradeData.existingTradeId}: ${tradeData.symbol} closed with P/L: $${tradeData.pnl}`);
                
                // Filter out non-database fields and calculated fields before updating
                // The Trade.update method will recalculate pnl and pnlPercent automatically
                // FIXED: Preserve executions data when updating existing trades
                const {
                  totalQuantity, entryValue, exitValue, isExistingPosition,
                  existingTradeId, isUpdate, totalFees, totalFeesForSymbol,
                  pnl, pnlPercent,
                  ...cleanTradeData
                } = tradeData;
                
                // Keep executionData for database update (Trade.create expects executionData)
                if (tradeData.executionData) {
                  cleanTradeData.executionData = tradeData.executionData;
                } else if (tradeData.executions) {
                  // Fallback to executions if executionData is not present
                  cleanTradeData.executionData = tradeData.executions;
                }
                await Trade.update(tradeData.existingTradeId, req.user.id, cleanTradeData);
              } else {
                await Trade.create(req.user.id, tradeData, { skipApiCalls: true });
              }
              imported++;
            } catch (error) {
              logger.logError(`Failed to import trade: ${JSON.stringify(tradeData)} - ${error.message}`);
              logger.logError(`Error stack: ${error.stack}`);
              failed++;
              failedTrades.push({
                trade: tradeData,
                error: error.message
              });
            }
          }

          logger.logImport(`Import completed: ${imported} imported, ${failed} failed, ${duplicates} duplicates skipped`);

          // Schedule background CUSIP resolution if there are unresolved CUSIPs
          if (unresolvedCusips.length > 0) {
            logger.logImport(`Scheduling background CUSIP resolution for ${unresolvedCusips.length} CUSIPs`);
            const cusipResolver = require('../utils/cusipResolver');
            cusipResolver.scheduleResolution(req.user.id, unresolvedCusips);
          }

          // Clear timeout on successful completion
          clearTimeout(importTimeout);
          
          await db.query(`
            UPDATE import_logs
            SET status = 'completed', trades_imported = $1, trades_failed = $2, completed_at = CURRENT_TIMESTAMP, error_details = $4
            WHERE id = $3
          `, [imported, failed, importId, failedTrades.length > 0 ? { failedTrades, duplicates } : { duplicates }]);
          
          // Invalidate sector performance cache after successful import
          try {
            await cache.invalidate('sector_performance');
            console.log('✅ Sector performance cache invalidated after import completion');
          } catch (cacheError) {
            console.warn('⚠️ Failed to invalidate sector performance cache:', cacheError.message);
          }

          // Invalidate behavioral analytics cache after import
          try {
            await AnalyticsCache.invalidateUserCache(req.user.id, [
              'top_missed_trades',
              'overconfidence_analysis',
              'loss_aversion_analysis',
              'personality_analysis'
            ]);
            console.log('✅ Behavioral analytics cache invalidated after import completion');
          } catch (cacheError) {
            console.warn('⚠️ Failed to invalidate behavioral analytics cache:', cacheError.message);
          }

          // Background categorization of new symbols
          try {
            console.log('🔄 Starting background symbol categorization after import...');
            // Run categorization in background without blocking the response
            symbolCategories.categorizeNewSymbols(req.user.id).then(result => {
              console.log(`✅ Background categorization complete: ${result.processed} of ${result.total} symbols categorized`);
            }).catch(error => {
              console.warn('⚠️ Background symbol categorization failed:', error.message);
            });
          } catch (error) {
            console.warn('⚠️ Failed to start background symbol categorization:', error.message);
          }

          // Check achievements and trigger leaderboard updates after import
          try {
            console.log('🏆 Checking achievements after import for user', req.user.id);
            const AchievementService = require('../services/achievementService');
            const newAchievements = await AchievementService.checkAndAwardAchievements(req.user.id);
            console.log(`🏅 Post-import achievements awarded: ${newAchievements.length}`);
          } catch (achievementError) {
            console.warn('⚠️ Failed to check/award achievements after import:', achievementError.message);
          }
        } catch (error) {
          // Clear timeout on error
          clearTimeout(importTimeout);
          
          logger.logError(`Import process failed: ${error.message}`);
          await db.query(`
            UPDATE import_logs
            SET status = 'failed', error_details = $1, completed_at = CURRENT_TIMESTAMP
            WHERE id = $2
          `, [{ error: error.message, stack: error.stack }, importId]);
        }
      });

      res.status(202).json({ 
        message: 'Import started',
        importId,
        importLog: importLog.rows[0]
      });
    } catch (error) {
      next(error);
    }
  },

  async getImportStatus(req, res, next) {
    try {
      const query = `
        SELECT * FROM import_logs
        WHERE id = $1 AND user_id = $2
      `;

      const result = await db.query(query, [req.params.importId, req.user.id]);
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Import not found' });
      }

      res.json({ importLog: result.rows[0] });
    } catch (error) {
      next(error);
    }
  },

  async getImportHistory(req, res, next) {
    try {
      const query = `
        SELECT * FROM import_logs
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT 20
      `;

      const result = await db.query(query, [req.user.id]);
      
      res.json({ imports: result.rows });
    } catch (error) {
      next(error);
    }
  },

  async getCusipResolutionStatus(req, res, next) {
    try {
      const cusipResolver = require('../utils/cusipResolver');
      const status = cusipResolver.getStatus();
      
      res.json({ cusipResolution: status });
    } catch (error) {
      next(error);
    }
  },

  async getOpenPositionsWithQuotes(req, res, next) {
    try {
      console.log('getOpenPositionsWithQuotes called for user:', req.user.id);
      const finnhub = require('../utils/finnhub');
      
      // Check if Finnhub is configured
      if (!finnhub.isConfigured()) {
        console.log('Finnhub not configured, proceeding without quotes');
      }

      // Get open trades
      console.log('Fetching open trades...');
      const openTrades = await Trade.findByUser(req.user.id, { 
        status: 'open',
        limit: 200
      });
      
      console.log(`Found ${openTrades.length} open trades`);

      if (openTrades.length === 0) {
        return res.json({ positions: [] });
      }

      // Group trades by symbol and calculate net position
      const positionMap = {};
      openTrades.forEach(trade => {
        if (!positionMap[trade.symbol]) {
          positionMap[trade.symbol] = {
            symbol: trade.symbol,
            side: null, // Will be determined by net position
            trades: [],
            totalQuantity: 0,
            totalCost: 0,
            avgPrice: 0
          };
        }
        
        positionMap[trade.symbol].trades.push(trade);
        
        // Calculate net position considering trade direction
        // Ensure quantity is parsed as number to avoid string concatenation
        const quantity = trade.side === 'long' ? Number(trade.quantity) : -Number(trade.quantity);
        positionMap[trade.symbol].totalQuantity += quantity;
        
        // For cost calculation, use absolute value since we're tracking net cost basis
        positionMap[trade.symbol].totalCost += Math.abs(quantity) * Number(trade.entry_price);
      });

      // Calculate average prices and determine position side
      const symbolsToDelete = [];
      Object.values(positionMap).forEach(position => {
        // Only remove if there are no trades at all (shouldn't happen, but safety check)
        if (position.trades.length === 0) {
          symbolsToDelete.push(position.symbol);
          return;
        }
        
        if (position.totalQuantity === 0) {
          // Net position is zero, but we have open trades - show as neutral/hedged
          position.side = 'neutral';
          // Calculate weighted average price from all trades
          let totalValue = 0;
          let totalShares = 0;
          position.trades.forEach(trade => {
            totalValue += Number(trade.entry_price) * Number(trade.quantity);
            totalShares += Number(trade.quantity);
          });
          position.avgPrice = totalShares > 0 ? totalValue / totalShares : 0;
          position.totalQuantity = 0; // Keep as 0 to show it's hedged
        } else {
          // Determine side based on net position
          position.side = position.totalQuantity > 0 ? 'long' : 'short';
          
          // Use absolute quantity for calculations
          const absQuantity = Math.abs(position.totalQuantity);
          position.totalQuantity = absQuantity;
          position.avgPrice = position.totalCost / absQuantity;
        }
      });
      
      // Remove symbols with zero net position
      symbolsToDelete.forEach(symbol => delete positionMap[symbol]);

      // Get unique symbols for quotes
      const symbols = Object.keys(positionMap);
      console.log('Symbols to get quotes for:', symbols);
      
      // If Finnhub is not configured, return positions without quotes
      if (!finnhub.isConfigured()) {
        console.log('Finnhub not configured, returning positions without quotes');
        const positions = Object.values(positionMap);
        return res.json({ 
          positions,
          error: 'Real-time quotes not available - Finnhub API key not configured'
        });
      }
      
      try {
        // Get real-time quotes
        console.log('Attempting to get quotes from Finnhub...');
        const quotes = await finnhub.getBatchQuotes(symbols);
        console.log('Received quotes:', quotes);
        
        // Enhance positions with real-time data
        const enhancedPositions = Object.values(positionMap).map(position => {
          const quote = quotes[position.symbol];
          
          if (quote) {
            const currentPrice = quote.c; // Current price
            let unrealizedPnL = 0;
            let unrealizedPnLPercent = 0;
            let currentValue = 0;
            
            if (position.side === 'neutral') {
              // For hedged positions, calculate P&L for each trade individually
              position.trades.forEach(trade => {
                const tradeValue = currentPrice * Number(trade.quantity);
                const tradeCost = Number(trade.entry_price) * Number(trade.quantity);
                if (trade.side === 'short') {
                  unrealizedPnL += tradeCost - tradeValue;
                } else {
                  unrealizedPnL += tradeValue - tradeCost;
                }
                currentValue += tradeValue;
              });
              unrealizedPnLPercent = position.totalCost > 0 ? (unrealizedPnL / position.totalCost) * 100 : 0;
            } else {
              currentValue = currentPrice * position.totalQuantity;
              // For short positions, profit is made when price goes down
              unrealizedPnL = position.side === 'short' 
                ? position.totalCost - currentValue  // Short: profit when current value < entry cost
                : currentValue - position.totalCost;  // Long: profit when current value > entry cost
              unrealizedPnLPercent = (unrealizedPnL / position.totalCost) * 100;
            }
            
            return {
              ...position,
              currentPrice,
              currentValue,
              unrealizedPnL,
              unrealizedPnLPercent,
              dayChange: quote.d, // Day's change in price
              dayChangePercent: quote.dp, // Day's change in percent
              high: quote.h, // Day's high
              low: quote.l, // Day's low
              open: quote.o, // Day's open
              previousClose: quote.pc, // Previous close
              quoteTime: new Date().toISOString()
            };
          } else {
            // Return position without real-time data
            return {
              ...position,
              currentPrice: null,
              currentValue: null,
              unrealizedPnL: null,
              unrealizedPnLPercent: null,
              error: `No quote available for ${position.symbol}`
            };
          }
        });

        // Sort by unrealized P&L (biggest gains/losses first)
        enhancedPositions.sort((a, b) => {
          if (a.unrealizedPnL === null) return 1;
          if (b.unrealizedPnL === null) return -1;
          return Math.abs(b.unrealizedPnL) - Math.abs(a.unrealizedPnL);
        });

        res.json({ 
          positions: enhancedPositions,
          quotesAvailable: Object.keys(quotes).length,
          totalPositions: enhancedPositions.length
        });

      } catch (quoteError) {
        console.error('Failed to get quotes:', quoteError);
        
        // Return positions without real-time data
        const positions = Object.values(positionMap);
        res.json({ 
          positions,
          error: `Failed to get real-time quotes: ${quoteError.message}`
        });
      }

    } catch (error) {
      console.error('Failed to get open positions:', error);
      next(error);
    }
  },

  async deleteImport(req, res, next) {
    try {
      const importId = req.params.importId;
      
      // First, verify the import belongs to the user
      const importQuery = `
        SELECT * FROM import_logs
        WHERE id = $1 AND user_id = $2
      `;
      
      const importResult = await db.query(importQuery, [importId, req.user.id]);
      
      if (importResult.rows.length === 0) {
        return res.status(404).json({ error: 'Import not found' });
      }

      // Find all trades from this import by using notes that contain the import ID or trade numbers
      // For Lightspeed, we can identify them by the broker and timeframe
      const importLog = importResult.rows[0];
      const importDate = importLog.created_at;

      logger.logImport(`Deleting import ${importId} for user ${req.user.id}`);

      // Delete trades that were created around the same time as the import
      // This is a simplified approach - in production you'd want to store import_id with each trade
      const deleteTradesQuery = `
        DELETE FROM trades 
        WHERE user_id = $1 
        AND broker = $2 
        AND created_at >= $3 
        AND created_at <= $4
        RETURNING id
      `;

      const timeWindow = new Date(importDate);
      timeWindow.setMinutes(timeWindow.getMinutes() + 5); // 5 minute window

      const deletedTrades = await db.query(deleteTradesQuery, [
        req.user.id,
        importLog.broker,
        importLog.created_at,
        timeWindow
      ]);

      // Delete associated jobs for the deleted trades
      if (deletedTrades.rows.length > 0) {
        const tradeIds = deletedTrades.rows.map(row => row.id);
        
        const jobDeleteQuery = `
          DELETE FROM job_queue 
          WHERE data->>'tradeId' = ANY($1)
          OR (data->'tradeIds' ?| $1)
          RETURNING id, type
        `;
        
        const deletedJobs = await db.query(jobDeleteQuery, [tradeIds.map(id => id.toString())]);
        
        logger.logImport(`Deleted ${deletedJobs.rows.length} jobs for ${deletedTrades.rows.length} deleted trades`);
      }

      // Delete the import log
      await db.query(`DELETE FROM import_logs WHERE id = $1`, [importId]);

      // Invalidate sector performance cache for this user
      try {
        await cache.invalidate('sector_performance');
        console.log('✅ Sector performance cache invalidated after import deletion');
      } catch (cacheError) {
        console.warn('⚠️ Failed to invalidate sector performance cache:', cacheError.message);
      }

      // Invalidate behavioral analytics cache after import deletion
      try {
        await AnalyticsCache.invalidateUserCache(req.user.id, [
          'top_missed_trades',
          'overconfidence_analysis',
          'loss_aversion_analysis',
          'personality_analysis'
        ]);
        console.log('✅ Behavioral analytics cache invalidated after import deletion');
      } catch (cacheError) {
        console.warn('⚠️ Failed to invalidate behavioral analytics cache:', cacheError.message);
      }

      logger.logImport(`Deleted ${deletedTrades.rows.length} trades from import ${importId}`);

      res.json({ 
        message: 'Import and associated trades deleted successfully',
        deletedTrades: deletedTrades.rows.length
      });
    } catch (error) {
      logger.logError(`Failed to delete import: ${error.message}`);
      next(error);
    }
  },

  async getImportLogs(req, res, next) {
    try {
      const logFiles = logger.getLogFiles();
      res.json({ logFiles });
    } catch (error) {
      next(error);
    }
  },

  async getLogFile(req, res, next) {
    try {
      const filename = req.params.filename;
      const content = logger.readLogFile(filename);
      
      if (!content) {
        return res.status(404).json({ error: 'Log file not found' });
      }

      res.json({ filename, content });
    } catch (error) {
      next(error);
    }
  },

  async getAnalytics(req, res, next) {
    try {
      console.log('=== ANALYTICS ENDPOINT CALLED ===');
      console.log('Query params:', req.query);
      console.log('User ID:', req.user.id);
      console.log('Side filter specifically:', req.query.side);
      
      const { 
        startDate, endDate, symbol, sector, strategy, 
        strategies, sectors, // Add multi-select parameters
        side, minPrice, maxPrice, minQuantity, maxQuantity,
        status, minPnl, maxPnl, pnlType, broker, hasNews,
        holdTime, minHoldTime, maxHoldTime, daysOfWeek 
      } = req.query;
      
      const filters = {
        startDate,
        endDate,
        symbol,
        sector,
        strategy,
        // Multi-select filters
        strategies: strategies ? strategies.split(',') : undefined,
        sectors: sectors ? sectors.split(',') : undefined,
        side,
        minPrice,
        maxPrice,
        minQuantity,
        maxQuantity,
        status,
        minPnl,
        maxPnl,
        pnlType,
        broker,
        hasNews,
        holdTime,
        daysOfWeek: daysOfWeek ? daysOfWeek.split(',').map(d => parseInt(d)) : undefined
      };
      
      console.log('🔍 getAnalytics RAW QUERY:', req.query);
      console.log('🔍 getAnalytics PARSED filters:', JSON.stringify(filters, null, 2));

      // Convert minHoldTime/maxHoldTime to holdTime range if provided
      if (minHoldTime || maxHoldTime) {
        const minTime = parseInt(minHoldTime) || 0;
        const maxTime = parseInt(maxHoldTime) || Infinity;
        const holdTimeRange = Trade.convertHoldTimeRange(minTime, maxTime);
        
        if (holdTimeRange) {
          filters.holdTime = holdTimeRange;
        }
      }
      
      const analytics = await Trade.getAnalytics(req.user.id, filters);
      
      console.log('Analytics result:', JSON.stringify(analytics, null, 2));
      
      res.json(analytics);
    } catch (error) {
      console.error('Analytics error:', error);
      next(error);
    }
  },

  async getSymbolList(req, res, next) {
    try {
      const symbols = await Trade.getSymbolList(req.user.id);
      res.json({ symbols });
    } catch (error) {
      next(error);
    }
  },

  async getStrategyList(req, res, next) {
    try {
      const strategies = await Trade.getStrategyList(req.user.id);
      res.json({ strategies });
    } catch (error) {
      next(error);
    }
  },

  async lookupCusip(req, res, next) {
    try {
      const { cusip } = req.params;
      
      if (!cusip || cusip.length !== 9) {
        return res.status(400).json({ error: 'Valid CUSIP must be 9 characters' });
      }

      // Check if Finnhub is configured
      if (!finnhub.isConfigured()) {
        return res.status(503).json({ 
          error: 'CUSIP lookup service not available - Finnhub API key not configured',
          cusip,
          ticker: null,
          found: false 
        });
      }

      const ticker = await finnhub.lookupCusip(cusip);
      
      if (ticker) {
        res.json({ cusip, ticker, found: true });
      } else {
        res.json({ cusip, ticker: null, found: false });
      }
    } catch (error) {
      console.error(`CUSIP lookup error for ${req.params.cusip}:`, error);
      
      // Return a user-friendly error instead of generic 500
      if (error.message?.includes('API key')) {
        return res.status(503).json({ 
          error: 'CUSIP lookup service not available',
          cusip: req.params.cusip,
          ticker: null,
          found: false 
        });
      }
      
      res.status(500).json({ 
        error: 'Failed to lookup CUSIP',
        cusip: req.params.cusip,
        ticker: null,
        found: false,
        details: error.message 
      });
    }
  },

  async addCusipMapping(req, res, next) {
    try {
      const { cusip, ticker } = req.body;
      
      if (!cusip || !ticker) {
        return res.status(400).json({ error: 'Both CUSIP and ticker are required' });
      }

      if (cusip.length !== 9) {
        return res.status(400).json({ error: 'CUSIP must be 9 characters' });
      }

      const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();
      const cleanTicker = ticker.toUpperCase();

      // Cache the mapping in the cache module
      const cache = require('../utils/cache');
      await cache.set('cusip_resolution', cleanCusip, cleanTicker);
      
      // Retroactively update existing trades that have this CUSIP as symbol
      const updateResult = await Trade.updateSymbolForCusip(req.user.id, cleanCusip, cleanTicker);
      
      res.json({ 
        message: 'CUSIP mapping added successfully',
        cusip: cleanCusip,
        ticker: cleanTicker,
        tradesUpdated: updateResult.affectedRows || 0
      });
    } catch (error) {
      next(error);
    }
  },

  async getCusipMappings(req, res, next) {
    try {
      // Get cached CUSIP mappings from database cache
      const cache = require('../utils/cache');
      const mappings = {};
      
      // Since we can't iterate over cache entries easily, we'll get this from the database directly
      const db = require('../config/database');
      const query = `
        SELECT cache_key, data 
        FROM api_cache 
        WHERE cache_type = 'cusip_resolution' AND expires_at > NOW()
      `;
      const result = await db.query(query);
      
      for (const row of result.rows) {
        const cusip = row.cache_key.replace('cusip_resolution:', '');
        mappings[cusip] = JSON.parse(row.data);
      }
      res.json({ mappings });
    } catch (error) {
      next(error);
    }
  },

  async deleteCusipMapping(req, res, next) {
    try {
      const { cusip } = req.params;
      
      if (!cusip) {
        return res.status(400).json({ error: 'CUSIP parameter is required' });
      }

      if (cusip.length !== 9) {
        return res.status(400).json({ error: 'CUSIP must be 9 characters' });
      }

      const cleanCusip = cusip.replace(/\s/g, '').toUpperCase();
      
      // Check if mapping exists in Finnhub cache
      const cacheKey = `cusip_${cleanCusip}`;
      const cachedMapping = finnhub.cache.get(cacheKey);
      
      if (!cachedMapping) {
        return res.status(404).json({ error: 'CUSIP mapping not found' });
      }

      const deletedTicker = cachedMapping.data;
      
      // Remove the mapping from cache
      const removed = finnhub.cache.delete(cacheKey);
      
      if (removed) {
        res.json({ 
          message: 'CUSIP mapping deleted successfully',
          cusip: cleanCusip,
          ticker: deletedTicker
        });
      } else {
        res.status(404).json({ error: 'CUSIP mapping not found' });
      }
    } catch (error) {
      next(error);
    }
  },

  async resolveUnresolvedCusips(req, res, next) {
    try {
      // Get cached CUSIPs from Finnhub
      const cachedCusips = [];
      for (const key of finnhub.cache.keys()) {
        if (key.startsWith('cusip_')) {
          cachedCusips.push(key.replace('cusip_', ''));
        }
      }
      
      let cusipQuery;
      let queryParams;
      
      if (cachedCusips.length === 0) {
        // No cached CUSIPs, find all CUSIP-like symbols
        cusipQuery = `
          SELECT DISTINCT symbol 
          FROM trades 
          WHERE user_id = $1 
          AND LENGTH(symbol) = 9 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
        `;
        queryParams = [req.user.id];
      } else {
        // Exclude cached CUSIPs
        cusipQuery = `
          SELECT DISTINCT symbol 
          FROM trades 
          WHERE user_id = $1 
          AND LENGTH(symbol) = 9 
          AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
          AND symbol NOT IN (${cachedCusips.map((_, i) => `$${i + 2}`).join(',')})
        `;
        queryParams = [req.user.id, ...cachedCusips];
      }
      
      const result = await db.query(cusipQuery, queryParams);
      const unresolvedCusips = result.rows.map(row => row.symbol);
      
      if (unresolvedCusips.length === 0) {
        return res.json({ 
          message: 'No unresolved CUSIPs found',
          resolved: 0,
          total: 0
        });
      }

      console.log(`Found ${unresolvedCusips.length} unresolved CUSIPs, attempting to resolve...`);
      
      // Resolve CUSIPs using Finnhub batch lookup
      const resolvedMappings = await finnhub.batchLookupCusips(unresolvedCusips);
      const resolvedCount = Object.keys(resolvedMappings).length;
      
      // Update trades with resolved mappings
      let updatedTrades = 0;
      for (const [cusip, ticker] of Object.entries(resolvedMappings)) {
        const updateResult = await Trade.updateSymbolForCusip(req.user.id, cusip, ticker);
        updatedTrades += updateResult.affectedRows || 0;
      }
      
      res.json({
        message: `Resolved ${resolvedCount} of ${unresolvedCusips.length} CUSIPs`,
        resolved: resolvedCount,
        total: unresolvedCusips.length,
        tradesUpdated: updatedTrades,
        mappings: resolvedMappings
      });
    } catch (error) {
      next(error);
    }
  },

  async getTradeJournalEntries(req, res, next) {
    try {
      const trade = await Trade.findById(req.params.id, req.user.id);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      res.json({
        message: 'Trade journal entries not yet implemented',
        entries: []
      });
    } catch (error) {
      next(error);
    }
  },

  async createJournalEntry(req, res, next) {
    try {
      const trade = await Trade.findById(req.params.id, req.user.id);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      res.status(201).json({
        message: 'Journal entry creation not yet implemented',
        entry: null
      });
    } catch (error) {
      next(error);
    }
  },

  async updateJournalEntry(req, res, next) {
    try {
      const trade = await Trade.findById(req.params.id, req.user.id);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      res.json({
        message: 'Journal entry update not yet implemented',
        entry: null
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteJournalEntry(req, res, next) {
    try {
      const trade = await Trade.findById(req.params.id, req.user.id);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      res.json({
        message: 'Journal entry deletion not yet implemented',
        deleted: false
      });
    } catch (error) {
      next(error);
    }
  },

  async exportTrades(req, res, next) {
    try {
      res.json({
        message: 'Trade export not yet implemented',
        format: null,
        data: null
      });
    } catch (error) {
      next(error);
    }
  },

  async debugSymbolSearch(req, res, next) {
    try {
      const { symbol } = req.query;
      if (!symbol) {
        return res.status(400).json({ error: 'Symbol parameter required' });
      }

      const upperSymbol = symbol.toUpperCase();
      console.log('Debug symbol search for:', upperSymbol, 'user:', req.user.id);
      
      // 1. Simple direct match
      const directMatchQuery = `SELECT id, symbol, trade_date, entry_price, quantity, side FROM trades WHERE user_id = $1 AND symbol = $2 LIMIT 5`;
      const directMatches = await db.query(directMatchQuery, [req.user.id, upperSymbol]);
      console.log('Direct matches:', directMatches.rows.length);

      // 2. All trades containing the symbol
      const allTradesQuery = `SELECT id, symbol, trade_date, entry_price, quantity, side FROM trades WHERE user_id = $1 AND symbol ILIKE $2 LIMIT 5`;
      const allMatches = await db.query(allTradesQuery, [req.user.id, `%${upperSymbol}%`]);
      console.log('Pattern matches:', allMatches.rows.length);

      // 3. Count total trades
      const countQuery = `SELECT COUNT(*) as total_trades FROM trades WHERE user_id = $1`;
      const counts = await db.query(countQuery, [req.user.id]);
      console.log('Total trades:', counts.rows[0]);

      res.json({
        searchTerm: upperSymbol,
        directMatches: directMatches.rows,
        patternMatches: allMatches.rows,
        totalTrades: counts.rows[0].total_trades,
        debug: {
          hasDirectMatches: directMatches.rows.length > 0,
          hasPatternMatches: allMatches.rows.length > 0
        }
      });
    } catch (error) {
      console.error('Debug symbol search error:', error);
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  },

  async syncEnrichmentStatus(req, res, next) {
    try {
      logger.logImport(`SYNC enrichment status requested by user ${req.user.id}`);
      
      // Find trades that have completed jobs but are still marked as pending enrichment
      const syncQuery = `
        UPDATE trades 
        SET enrichment_status = 'completed',
            enrichment_completed_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
        AND enrichment_status != 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM job_queue jq 
          WHERE jq.data::json->>'tradeId' = trades.id::text
          AND jq.status IN ('pending', 'processing')
        )
        RETURNING id, symbol
      `;
      
      const syncResult = await db.query(syncQuery, [req.user.id]);
      
      res.json({
        message: 'Enrichment status synced successfully',
        syncedTrades: syncResult.rowCount,
        trades: syncResult.rows
      });
    } catch (error) {
      next(error);
    }
  },

  async forceCompleteEnrichment(req, res, next) {
    try {
      logger.logImport(`FORCE COMPLETE enrichment requested by user ${req.user.id}`);
      
      // NUCLEAR OPTION: Force complete ALL pending enrichment jobs
      const forceCompleteQuery = `
        UPDATE job_queue 
        SET status = 'completed', 
            completed_at = CURRENT_TIMESTAMP,
            result = '{"forced": true, "reason": "Manual force complete"}'
        WHERE user_id = $1
        AND status IN ('pending', 'processing')
        RETURNING id, type
      `;
      
      const forceCompleteResult = await db.query(forceCompleteQuery, [req.user.id]);
      
      // Force complete all trades stuck in enrichment
      const forceTradesQuery = `
        UPDATE trades 
        SET enrichment_status = 'completed',
            enrichment_completed_at = CURRENT_TIMESTAMP,
            strategy = CASE 
              WHEN strategy IS NULL OR strategy = '' THEN 'day_trading'
              ELSE strategy
            END,
            strategy_confidence = CASE
              WHEN strategy_confidence IS NULL THEN 70
              ELSE strategy_confidence
            END,
            classification_method = 'force_completed'
        WHERE user_id = $1
        AND enrichment_status != 'completed'
        RETURNING id
      `;
      
      const forceTradesResult = await db.query(forceTradesQuery, [req.user.id]);
      
      res.json({
        message: 'ALL enrichment FORCE COMPLETED - no more stuck jobs possible',
        forceCompletedJobs: forceCompleteResult.rowCount,
        forceCompletedTrades: forceTradesResult.rowCount,
        details: {
          jobs: forceCompleteResult.rows,
          trades: forceTradesResult.rows.map(row => row.id)
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async retryEnrichment(req, res, next) {
    try {
      logger.logImport(`Manual enrichment retry requested by user ${req.user.id}`);
      
      // Find all trades with unresolved CUSIPs
      const unresolvedQuery = `
        SELECT DISTINCT symbol
        FROM trades 
        WHERE user_id = $1 
        AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
        AND NOT EXISTS (
          SELECT 1 FROM cusip_mappings cm 
          WHERE cm.cusip = trades.symbol
        )
      `;
      
      const unresolvedResult = await db.query(unresolvedQuery, [req.user.id]);
      const cusips = unresolvedResult.rows.map(row => row.symbol);
      
      if (cusips.length > 0) {
        logger.logImport(`Found ${cusips.length} unresolved CUSIPs, scheduling resolution`);
        const cusipResolver = require('../utils/cusipResolver');
        await cusipResolver.scheduleResolution(req.user.id, cusips);
      }
      
      // Reset any stuck jobs for this user
      const resetQuery = `
        UPDATE job_queue 
        SET status = 'pending', 
            started_at = NULL,
            attempts = 0
        WHERE user_id = $1
        AND type IN ('cusip_resolution', 'strategy_classification', 'news_enrichment')
        AND status IN ('processing', 'failed')
        RETURNING id, type
      `;
      
      const resetResult = await db.query(resetQuery, [req.user.id]);
      
      // Emergency fallback: For trades that have been stuck in enrichment for too long,
      // mark them as completed with basic classification
      const emergencyFallbackQuery = `
        UPDATE trades 
        SET enrichment_status = 'completed',
            enrichment_completed_at = CURRENT_TIMESTAMP,
            strategy = CASE 
              WHEN strategy IS NULL OR strategy = '' THEN 'day_trading'
              ELSE strategy
            END,
            strategy_confidence = CASE
              WHEN strategy_confidence IS NULL THEN 50
              ELSE strategy_confidence
            END,
            classification_method = 'emergency_fallback'
        WHERE user_id = $1
        AND enrichment_status = 'pending'
        AND created_at < NOW() - INTERVAL '1 hour'
        RETURNING id
      `;
      
      const emergencyResult = await db.query(emergencyFallbackQuery, [req.user.id]);
      
      res.json({
        message: 'Enrichment retry initiated with emergency recovery',
        unresolvedCusips: cusips.length,
        resetJobs: resetResult.rowCount,
        emergencyFallbackTrades: emergencyResult.rowCount,
        details: {
          resetJobs: resetResult.rows.map(row => ({ id: row.id, type: row.type })),
          fallbackTradeIds: emergencyResult.rows.map(row => row.id)
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getEnrichmentStatus(req, res, next) {
    try {
      // Get enrichment status for the user's trades
      const query = `
        SELECT 
          enrichment_status,
          COUNT(*) as count
        FROM trades 
        WHERE user_id = $1 
        GROUP BY enrichment_status
      `;
      
      const result = await db.query(query, [req.user.id]);
      
      // Also check for trades with potential CUSIP symbols
      const cusipQuery = `
        SELECT COUNT(*) as count
        FROM trades 
        WHERE user_id = $1 
        AND symbol ~ '^[A-Z0-9]{8}[0-9]$'
        AND NOT EXISTS (
          SELECT 1 FROM cusip_mappings cm 
          WHERE cm.cusip = trades.symbol
        )
      `;
      
      const cusipResult = await db.query(cusipQuery, [req.user.id]);
      
      // Check for stuck CUSIP resolution jobs
      const stuckJobsQuery = `
        SELECT COUNT(*) as count
        FROM job_queue
        WHERE user_id = $1
        AND type = 'cusip_resolution'
        AND status IN ('pending', 'processing')
      `;
      
      const stuckJobsResult = await db.query(stuckJobsQuery, [req.user.id]);
      
      res.json({
        tradeEnrichment: result.rows,
        unresolvedCusips: cusipResult.rows[0].count,
        stuckCusipJobs: stuckJobsResult.rows[0].count
      });
    } catch (error) {
      next(error);
    }
  },

  // Get upcoming earnings for symbols
  async getUpcomingEarnings(req, res, next) {
    try {
      const { symbols } = req.query;
      
      if (!symbols) {
        return res.status(400).json({
          error: 'Missing symbols parameter'
        });
      }
      
      const symbolList = symbols.split(',').map(s => s.trim()).filter(s => s);
      
      if (symbolList.length === 0) {
        return res.json([]);
      }
      
      // Check if Finnhub is configured
      if (!finnhub.isConfigured()) {
        return res.json([]);
      }
      
      try {
        // Get earnings for the next 2 weeks for all symbols
        const fromDate = new Date().toISOString().split('T')[0];
        const toDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        
        // Fetch earnings for all symbols
        let allEarnings = [];
        for (const symbol of symbolList) {
          try {
            const earnings = await finnhub.getEarningsCalendar(fromDate, toDate, symbol);
            if (earnings && earnings.length > 0) {
              allEarnings = allEarnings.concat(earnings);
            }
          } catch (symbolError) {
            console.warn(`Failed to get earnings for ${symbol}:`, symbolError.message);
          }
        }
        
        res.json(allEarnings);
      } catch (error) {
        console.warn('Finnhub earnings API error:', error.message);
        res.json([]); // Return empty array if API fails
      }
    } catch (error) {
      console.error('Error fetching upcoming earnings:', error);
      res.status(500).json({
        error: 'Failed to fetch earnings data'
      });
    }
  },

  // Get trade-related news for symbols
  async getTradeNews(req, res, next) {
    try {
      const { symbols } = req.query;
      
      if (!symbols) {
        return res.status(400).json({
          error: 'Missing symbols parameter'
        });
      }
      
      const symbolList = symbols.split(',').map(s => s.trim()).filter(s => s);
      
      if (symbolList.length === 0) {
        return res.json([]);
      }
      
      // Check if Finnhub is configured
      if (!finnhub.isConfigured()) {
        return res.json([]);
      }
      
      try {
        // Get news for the last week for all symbols
        const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const toDate = new Date().toISOString().split('T')[0];
        
        // Fetch news for all symbols
        let allNews = [];
        for (const symbol of symbolList) {
          try {
            const news = await finnhub.getCompanyNews(symbol, fromDate, toDate);
            if (news && news.length > 0) {
              // Tag each news item with the symbol it belongs to
              const taggedNews = news.map(item => ({
                ...item,
                symbol: symbol // Ensure each news item has the correct symbol
              }));
              allNews = allNews.concat(taggedNews);
            }
          } catch (symbolError) {
            console.warn(`Failed to get news for ${symbol}:`, symbolError.message);
          }
        }
        
        // Sort by date (most recent first) and limit to recent news
        allNews.sort((a, b) => new Date(b.datetime * 1000) - new Date(a.datetime * 1000));
        
        res.json(allNews.slice(0, 20)); // Return top 20 most recent news items
      } catch (error) {
        console.warn('Finnhub news API error:', error.message);
        res.json([]); // Return empty array if API fails
      }
    } catch (error) {
      console.error('Error fetching trade news:', error);
      res.status(500).json({
        error: 'Failed to fetch news data'
      });
    }
  },

  async getTradeChartData(req, res, next) {
    try {
      const userId = req.user.id;
      const tradeId = req.params.id;
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(tradeId)) {
        return res.status(400).json({ error: 'Invalid trade ID format' });
      }

      // First, get the trade to verify ownership and get symbol/dates
      const trade = await Trade.findById(tradeId, userId);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Debug: Log what fields we actually get from the database
      console.log('=== TRADE RECORD DEBUG ===');
      console.log('Available trade fields:', Object.keys(trade));
      console.log('Time-related fields:', {
        trade_date: trade.trade_date,
        entry_time: trade.entry_time,
        exit_time: trade.exit_time,
        entry_date: trade.entry_date,
        exit_date: trade.exit_date,
        created_at: trade.created_at,
        updated_at: trade.updated_at
      });

      // Extract symbol and dates from the trade
      const symbol = trade.symbol;
      
      // Use the actual entry_time and exit_time from the database directly for chart data
      // These are already in UTC and the chart service will handle timezone conversion
      const entryDate = trade.entry_time || trade.trade_date;
      const exitDate = trade.exit_time || null;

      if (!symbol) {
        return res.status(400).json({ error: 'Trade missing symbol information' });
      }

      if (!entryDate) {
               return res.status(400).json({ error: 'Trade missing entry date information' });
      }

      // Get chart data using the ChartService
      const chartData = await ChartService.getTradeChartData(userId, symbol, entryDate, exitDate);
      
      // Add trade information to the response
      chartData.trade = {
        id: trade.id,
        symbol: symbol,
        entryDate: entryDate,
        exitDate: exitDate,
        // Include ALL time-related fields for debugging
        entryTime: trade.entry_time,
        exitTime: trade.exit_time,
        tradeDate: trade.trade_date,
        entryDateField: trade.entry_date,
        exitDateField: trade.exit_date,
        createdAt: trade.created_at,
        updatedAt: trade.updated_at,
        // Trade details
        entryPrice: trade.price || trade.entry_price,
        exitPrice: trade.exit_price,
        quantity: trade.quantity,
        side: trade.side,
        pnl: trade.pnl,
        pnlPercent: trade.pnl_percent
      };

      console.log('Sending trade data to frontend:', {
        entryDate: chartData.trade.entryDate,
        exitDate: chartData.trade.exitDate,
        entryTime: chartData.trade.entryTime,
        exitTime: chartData.trade.exitTime
      });

      // Get usage statistics for the response
      const usageStats = await ChartService.getUsageStats(userId);
      chartData.usage = usageStats;

      res.json(chartData);
    } catch (error) {
      console.error('Error fetching trade chart data:', error);
      
      // Handle specific errors
      if (error.message && error.message.includes('not configured')) {
        return res.status(503).json({
          error: 'Chart service not configured',
          message: error.message
        });
      }
      
      if (error.message && (error.message.includes('limit') || error.message.includes('rate'))) {
        return res.status(429).json({
          error: 'Chart service rate limit exceeded',
          message: error.message
        });
      }
      
      // Handle symbol not found or data unavailable
      if (error.message && (error.message.includes('unavailable') || error.message.includes('not supported') || error.message.includes('delisted'))) {
        return res.status(404).json({
          error: 'Chart data unavailable',
          message: error.message,
          symbol: req.params.id ? 'Unknown' : undefined
        });
      }
      
      res.status(500).json({
        error: 'Failed to fetch chart data',
        message: error.message
      });
    }
  }
};

module.exports = tradeController;