const Trade = require('../models/Trade');
const { parseCSV } = require('../utils/csvParser');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');
const finnhub = require('../utils/finnhub');

const tradeController = {
  async getUserTrades(req, res, next) {
    try {
      const { 
        symbol, startDate, endDate, tags, strategy, 
        side, minPrice, maxPrice, minQuantity, maxQuantity,
        status, minPnl, maxPnl, pnlType,
        limit = 50, offset = 0 
      } = req.query;
      
      const filters = {
        symbol,
        startDate,
        endDate,
        tags: tags ? tags.split(',') : undefined,
        strategy,
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
        // Pagination
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      // Get trades with pagination
      const trades = await Trade.findByUser(req.user.id, filters);
      
      // Get total count without pagination for pagination metadata
      const totalCountFilters = { ...filters };
      delete totalCountFilters.limit;
      delete totalCountFilters.offset;
      const allTrades = await Trade.findByUser(req.user.id, totalCountFilters);
      const total = allTrades.length;
      
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
      res.status(201).json({ trade });
    } catch (error) {
      next(error);
    }
  },

  async getTrade(req, res, next) {
    try {
      const trade = await Trade.findById(req.params.id, req.user?.id);
      
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
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

      res.json({ trade });
    } catch (error) {
      next(error);
    }
  },

  async deleteTrade(req, res, next) {
    try {
      // First, get the trade to check ownership
      const trade = await Trade.findById(req.params.id);
      
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Check if user is the trade owner or an admin
      const isOwner = trade.user_id === req.user.id;
      const isAdmin = req.user.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Access denied. You can only delete your own trades.' });
      }

      // Delete the trade (pass the trade owner's ID for the database constraint)
      const result = await Trade.delete(req.params.id, trade.user_id);
      
      if (!result) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      res.json({ message: 'Trade deleted successfully' });
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
      
      res.status(201).json({ comment: selectResult.rows[0] });
    } catch (error) {
      next(error);
    }
  },

  async getComments(req, res, next) {
    try {
      const trade = await Trade.findById(req.params.id, req.user?.id);
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

      const result = await db.query(query, [req.params.id]);
      
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

      // Check if trade exists
      const trade = await Trade.findById(tradeId);
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

      // Check if trade exists
      const trade = await Trade.findById(tradeId);
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
          const parseResult = await parseCSV(req.file.buffer, broker);
          
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
          const existingTradesQuery = `
            SELECT symbol, entry_time, entry_price, quantity, side 
            FROM trades 
            WHERE user_id = $1 
            AND broker = $2
            AND trade_date >= $3
            AND trade_date <= $4
          `;

          // Get date range from trades
          const tradeDates = trades.map(t => new Date(t.tradeDate)).filter(d => !isNaN(d));
          const minDate = tradeDates.length > 0 ? new Date(Math.min(...tradeDates)) : new Date();
          const maxDate = tradeDates.length > 0 ? new Date(Math.max(...tradeDates)) : new Date();

          const existingTrades = await db.query(existingTradesQuery, [
            req.user.id, 
            broker, 
            minDate.toISOString().split('T')[0],
            maxDate.toISOString().split('T')[0]
          ]);

          logger.logImport(`Found ${existingTrades.rows.length} existing trades in date range`);

          logger.logImport(`Processing ${trades.length} trades for import...`);
          
          for (const tradeData of trades) {
            try {
              // Minimal logging to avoid slowdowns
              
              // Check for duplicates
              const isDuplicate = existingTrades.rows.some(existing => 
                existing.symbol === tradeData.symbol &&
                existing.entry_price === tradeData.entryPrice &&
                existing.quantity === tradeData.quantity &&
                existing.side === tradeData.side &&
                Math.abs(new Date(existing.entry_time) - new Date(tradeData.entryTime)) < 60000 // Within 1 minute
              );

              if (isDuplicate) {
                logger.logImport(`Skipping duplicate trade: ${tradeData.symbol} ${tradeData.quantity} at ${tradeData.entryPrice}`);
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
              await Trade.create(req.user.id, tradeData);
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

      // Group trades by symbol
      const positionMap = {};
      openTrades.forEach(trade => {
        if (!positionMap[trade.symbol]) {
          positionMap[trade.symbol] = {
            symbol: trade.symbol,
            side: trade.side,
            trades: [],
            totalQuantity: 0,
            totalCost: 0,
            avgPrice: 0
          };
        }
        
        positionMap[trade.symbol].trades.push(trade);
        positionMap[trade.symbol].totalQuantity += trade.quantity;
        positionMap[trade.symbol].totalCost += (trade.entry_price * trade.quantity);
      });

      // Calculate average prices
      Object.values(positionMap).forEach(position => {
        position.avgPrice = position.totalCost / position.totalQuantity;
      });

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
            const currentValue = currentPrice * position.totalQuantity;
            const unrealizedPnL = currentValue - position.totalCost;
            const unrealizedPnLPercent = (unrealizedPnL / position.totalCost) * 100;
            
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

      // Delete the import log
      await db.query(`DELETE FROM import_logs WHERE id = $1`, [importId]);

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
      console.log('User ID:', req.user.id);
      console.log('Query params:', req.query);
      
      const { startDate, endDate, symbol, strategy } = req.query;
      
      const filters = {
        startDate,
        endDate,
        symbol,
        strategy
      };

      console.log('Filters:', filters);
      
      const analytics = await Trade.getAnalytics(req.user.id, filters);
      
      console.log('Analytics response summary:', {
        totalTrades: analytics.summary.totalTrades,
        totalPnL: analytics.summary.totalPnL,
        winRate: analytics.summary.winRate
      });
      
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

      const ticker = await finnhub.lookupCusip(cusip);
      
      if (ticker) {
        res.json({ cusip, ticker, found: true });
      } else {
        res.json({ cusip, ticker: null, found: false });
      }
    } catch (error) {
      next(error);
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

      // Cache the mapping in Finnhub
      finnhub.cache.set(`cusip_${cleanCusip}`, {
        data: cleanTicker,
        timestamp: Date.now()
      });
      
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
      // Get Finnhub cached mappings
      const mappings = {};
      for (const [key, value] of finnhub.cache.entries()) {
        if (key.startsWith('cusip_')) {
          const cusip = key.replace('cusip_', '');
          mappings[cusip] = value.data;
        }
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
  }
};

module.exports = tradeController;