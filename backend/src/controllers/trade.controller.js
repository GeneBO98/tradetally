const Trade = require('../models/Trade');
const { parseCSV } = require('../utils/csvParser');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');
const finnhub = require('../utils/finnhub');
const cache = require('../utils/cache');
const symbolCategories = require('../utils/symbolCategories');

const tradeController = {
  async getUserTrades(req, res, next) {
    try {
      const { 
        symbol, startDate, endDate, tags, strategy, sector,
        side, minPrice, maxPrice, minQuantity, maxQuantity,
        status, minPnl, maxPnl, pnlType, broker,
        limit = 50, offset = 0 
      } = req.query;
      
      const filters = {
        symbol,
        startDate,
        endDate,
        tags: tags ? tags.split(',') : undefined,
        strategy,
        sector,
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
        // Pagination
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      // Get trades with pagination
      const trades = await Trade.findByUser(req.user.id, filters);
      
      // Get total count using round-trip counting methodology for consistency with analytics
      const totalCountFilters = { ...filters };
      delete totalCountFilters.limit;
      delete totalCountFilters.offset;
      
      // Use the same round-trip counting logic as analytics
      const roundTripTotal = await Trade.getRoundTripTradeCount(req.user.id, totalCountFilters);
      const total = roundTripTotal;
      
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
        side, minPrice, maxPrice, minQuantity, maxQuantity,
        status, minPnl, maxPnl, pnlType, broker,
        limit = 50, offset = 0 
      } = req.query;
      
      const filters = {
        symbol,
        startDate,
        endDate,
        tags: tags ? tags.split(',') : undefined,
        strategy,
        sector,
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
      
      res.status(201).json({ trade });
    } catch (error) {
      next(error);
    }
  },

  async getTrade(req, res, next) {
    try {
      const tradeId = req.params.id;
      
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      if (!uuidRegex.test(tradeId)) {
        return res.status(400).json({ error: 'Invalid trade ID format' });
      }
      
      const trade = await Trade.findById(tradeId, req.user?.id);
      
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
          
          // Fetch existing open positions for context-aware parsing
          logger.logImport(`Fetching existing open positions for context-aware import...`);
          const openPositionsQuery = `
            SELECT id, symbol, side, quantity, entry_price, entry_time, trade_date, commission, broker
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
            // Parse executions JSON if it's a string
            let parsedExecutions = [];
            if (row.executions) {
              try {
                parsedExecutions = typeof row.executions === 'string' 
                  ? JSON.parse(row.executions) 
                  : row.executions;
              } catch (e) {
                console.warn(`Failed to parse executions for trade ${row.id}:`, e);
                parsedExecutions = [];
              }
            }
            
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
              executions: parsedExecutions  // Use parsed executions
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
          // Include executions data to check for exact execution timestamp matches
          const existingTradesQuery = `
            SELECT symbol, entry_time, entry_price, exit_price, pnl, quantity, side, executions
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
              // Check for duplicates based on entry price, exit price, and P/L
              // This is more reliable than symbol matching as symbols can be resolved differently
              // (e.g., CUSIP lookups may resolve to different symbols on different imports)
              // Using price and P/L matching prevents duplicate trades from being imported
              const isDuplicate = existingTrades.rows.some(existing => {
                // Parse existing executions if available
                let existingExecutions = [];
                if (existing.executions) {
                  try {
                    existingExecutions = typeof existing.executions === 'string' 
                      ? JSON.parse(existing.executions) 
                      : existing.executions;
                  } catch (e) {
                    existingExecutions = [];
                  }
                }
                
                // If both trades have executions, check for exact timestamp matches
                // This is the most precise duplicate detection
                if (tradeData.executionData && tradeData.executionData.length > 0 && existingExecutions.length > 0) {
                  // Create a set of execution timestamps from the new trade
                  const newExecutionTimestamps = new Set(
                    tradeData.executionData.map(exec => 
                      new Date(exec.datetime).getTime()
                    )
                  );
                  
                  // Check if any existing execution has the same timestamp
                  // If we find even one matching timestamp, it's likely a duplicate
                  const hasMatchingExecution = existingExecutions.some(exec => {
                    const execTime = new Date(exec.datetime).getTime();
                    return newExecutionTimestamps.has(execTime);
                  });
                  
                  if (hasMatchingExecution) {
                    logger.logImport(`Found duplicate based on execution timestamp match`);
                    return true;
                  }
                }
                
                // Fallback to the original logic for trades without execution data
                // For closed trades, check entry, exit, and P/L
                if (tradeData.exitPrice && existing.exit_price) {
                  const entryMatch = Math.abs(parseFloat(existing.entry_price) - parseFloat(tradeData.entryPrice)) < 0.01;
                  const exitMatch = Math.abs(parseFloat(existing.exit_price) - parseFloat(tradeData.exitPrice)) < 0.01;
                  const pnlMatch = Math.abs(parseFloat(existing.pnl || 0) - parseFloat(tradeData.pnl || 0)) < 0.01; // $0.01 tolerance for P/L consistency
                  
                  // Also check if entry times are very close (within 1 second)
                  const entryTimeMatch = Math.abs(new Date(existing.entry_time) - new Date(tradeData.entryTime)) < 1000;
                  
                  return entryMatch && exitMatch && pnlMatch && entryTimeMatch;
                }
                // For open trades, check entry price, quantity, side, and exact entry time
                else if (!tradeData.exitPrice && !existing.exit_price) {
                  return (
                    Math.abs(parseFloat(existing.entry_price) - parseFloat(tradeData.entryPrice)) < 0.01 &&
                    existing.quantity === tradeData.quantity &&
                    existing.side === tradeData.side &&
                    Math.abs(new Date(existing.entry_time) - new Date(tradeData.entryTime)) < 1000 // Within 1 second (more precise)
                  );
                }
                return false;
              });

              if (isDuplicate) {
                logger.logImport(`Skipping duplicate trade: ${tradeData.symbol} ${tradeData.side} ${tradeData.quantity} at $${tradeData.entryPrice} (${new Date(tradeData.entryTime).toISOString()})`);
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
                // IMPORTANT: Preserve executions when updating existing trades
                const {
                  totalQuantity, entryValue, exitValue, isExistingPosition,
                  existingTradeId, isUpdate, executionData, totalFees, totalFeesForSymbol,
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
                await Trade.create(req.user.id, tradeData);
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
        const quantity = trade.side === 'long' ? trade.quantity : -trade.quantity;
        positionMap[trade.symbol].totalQuantity += quantity;
        
        // For cost calculation, use absolute value since we're tracking net cost basis
        positionMap[trade.symbol].totalCost += Math.abs(quantity) * trade.entry_price;
      });

      // Calculate average prices and determine position side
      const symbolsToDelete = [];
      Object.values(positionMap).forEach(position => {
        if (position.totalQuantity === 0) {
          // No net position, mark for deletion
          symbolsToDelete.push(position.symbol);
          return;
        }
        
        // Determine side based on net position
        position.side = position.totalQuantity > 0 ? 'long' : 'short';
        
        // Use absolute quantity for calculations
        const absQuantity = Math.abs(position.totalQuantity);
        position.totalQuantity = absQuantity;
        position.avgPrice = position.totalCost / absQuantity;
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
            const currentValue = currentPrice * position.totalQuantity;
            // For short positions, profit is made when price goes down
            const unrealizedPnL = position.side === 'short' 
              ? position.totalCost - currentValue  // Short: profit when current value < entry cost
              : currentValue - position.totalCost;  // Long: profit when current value > entry cost
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

      // Invalidate sector performance cache for this user
      try {
        await cache.invalidate('sector_performance');
        console.log('✅ Sector performance cache invalidated after import deletion');
      } catch (cacheError) {
        console.warn('⚠️ Failed to invalidate sector performance cache:', cacheError.message);
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

      // Check if Finnhub is configured before attempting lookup
      if (!finnhub.isConfigured()) {
        return res.status(503).json({ 
          error: 'CUSIP lookup service not configured', 
          details: 'Finnhub API key is required for CUSIP resolution. Add FINNHUB_API_KEY to your environment variables.',
          cusip,
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
      // Provide more descriptive error messages for CUSIP lookup failures
      if (error.message.includes('Finnhub API key not configured')) {
        return res.status(503).json({ 
          error: 'CUSIP lookup service not configured', 
          details: 'Add FINNHUB_API_KEY to your environment variables.',
          cusip: req.params.cusip,
          found: false
        });
      }
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

  async getTradeNews(req, res, next) {
    try {
      const { symbols } = req.query;
      
      if (!symbols) {
        return res.status(400).json({ error: 'Symbols parameter is required' });
      }

      const symbolList = symbols.split(',').map(s => s.trim()).filter(s => s);
      
      if (symbolList.length === 0) {
        return res.json([]);
      }

      const finnhub = require('../utils/finnhub');
      
      if (!finnhub.isConfigured()) {
        return res.status(503).json({ 
          error: 'News service not configured',
          details: 'Finnhub API key is required for news data. Add FINNHUB_API_KEY to your environment variables.'
        });
      }

      const allNews = [];
      const errors = [];

      // Fetch news for each symbol
      for (const symbol of symbolList) {
        try {
          const news = await finnhub.getCompanyNews(symbol);
          
          // Add symbol to each news item and filter to last 7 days
          const enrichedNews = news
            .map(item => ({ ...item, symbol }))
            .filter(item => {
              // Ensure news is from last 7 days
              const newsDate = new Date(item.datetime * 1000);
              const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
              return newsDate >= sevenDaysAgo;
            })
            .slice(0, 5); // Limit to 5 news items per symbol
          
          allNews.push(...enrichedNews);
        } catch (error) {
          console.error(`Failed to fetch news for ${symbol}:`, error);
          errors.push({ symbol, error: error.message });
        }
      }

      // Sort all news by datetime descending
      allNews.sort((a, b) => b.datetime - a.datetime);

      res.json(allNews);
    } catch (error) {
      next(error);
    }
  },

  async getUpcomingEarnings(req, res, next) {
    try {
      const { symbols } = req.query;
      
      if (!symbols) {
        return res.status(400).json({ error: 'Symbols parameter is required' });
      }

      const symbolList = symbols.split(',').map(s => s.trim()).filter(s => s);
      
      if (symbolList.length === 0) {
        return res.json([]);
      }

      const finnhub = require('../utils/finnhub');
      
      if (!finnhub.isConfigured()) {
        return res.status(503).json({ 
          error: 'Earnings service not configured',
          details: 'Finnhub API key is required for earnings data. Add FINNHUB_API_KEY to your environment variables.'
        });
      }

      // Get earnings for next 2 weeks
      const from = new Date().toISOString().split('T')[0];
      const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      try {
        // Fetch all earnings for the date range
        const allEarnings = await finnhub.getEarningsCalendar(from, to);
        
        // Filter to only include symbols in user's open positions
        const symbolSet = new Set(symbolList.map(s => s.toUpperCase()));
        const relevantEarnings = allEarnings.filter(earning => 
          symbolSet.has(earning.symbol.toUpperCase())
        );
        
        // Sort by date
        relevantEarnings.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        res.json(relevantEarnings);
      } catch (error) {
        console.error('Failed to fetch earnings calendar:', error);
        res.json([]); // Return empty array on error to not break the UI
      }
    } catch (error) {
      next(error);
    }
  },

  async getTradeChartData(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      
      if (!uuidRegex.test(id)) {
        return res.status(400).json({ error: 'Invalid trade ID format' });
      }

      // Get the trade
      const trade = await Trade.findById(id, userId);
      
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Access control is already handled by findById with userId parameter

      // Only show charts for closed trades
      if (!trade.exit_price || !trade.exit_time) {
        return res.status(400).json({ error: 'Chart data only available for closed trades' });
      }

      const alphaVantage = require('../utils/alphaVantage');
      
      if (!alphaVantage.isConfigured()) {
        return res.status(503).json({ 
          error: 'Chart service not configured. Alpha Vantage API key is required.',
          details: 'Add ALPHA_VANTAGE_API_KEY to your environment variables'
        });
      }

      try {
        // Get chart data based on trade duration
        const chartData = await alphaVantage.getTradeChartData(
          trade.symbol,
          trade.entry_time,
          trade.exit_time
        );

        // Filter data to relevant date range (1 day before entry to 1 day after exit)
        const entryTime = new Date(trade.entry_time).getTime() / 1000;
        const exitTime = new Date(trade.exit_time).getTime() / 1000;
        const oneDaySec = 24 * 60 * 60;
        
        const filteredData = chartData.data.filter(candle => 
          candle.time >= (entryTime - oneDaySec) && 
          candle.time <= (exitTime + oneDaySec)
        );

        // Prepare response with trade markers
        res.json({
          symbol: trade.symbol,
          type: chartData.type,
          interval: chartData.interval,
          candles: filteredData,
          trade: {
            entryPrice: trade.entry_price,
            entryTime: entryTime,
            exitPrice: trade.exit_price,
            exitTime: exitTime,
            side: trade.side,
            quantity: trade.quantity,
            pnl: trade.pnl,
            pnlPercent: trade.pnl_percent
          },
          usage: alphaVantage.getUsageStats()
        });
      } catch (error) {
        console.error('Failed to fetch chart data:', error);
        console.error('Error details:', {
          message: error.message,
          stack: error.stack,
          tradeSymbol: trade.symbol,
          entryTime: trade.entry_time,
          exitTime: trade.exit_time
        });
        
        // If it's a rate limit error, return appropriate status
        if (error.message.includes('limit')) {
          return res.status(429).json({ 
            error: error.message,
            usage: await alphaVantage.getUsageStats()
          });
        }
        
        // Return more specific error message
        res.status(500).json({ 
          error: error.message || 'Failed to load chart data',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    } catch (error) {
      next(error);
    }
  },

  // CUSIP Queue Management
  async getCusipQueueStats(req, res, next) {
    try {
      const cusipQueue = require('../utils/cusipQueue');
      const stats = await cusipQueue.getQueueStats();
      res.json({ stats });
    } catch (error) {
      next(error);
    }
  },

  async addCusipToQueue(req, res, next) {
    try {
      const { cusips, priority = 1 } = req.body;
      
      if (!cusips || (Array.isArray(cusips) && cusips.length === 0)) {
        return res.status(400).json({ error: 'CUSIPs are required' });
      }

      const cusipQueue = require('../utils/cusipQueue');
      await cusipQueue.addToQueue(cusips, priority);
      
      res.json({ 
        message: 'CUSIPs added to processing queue',
        cusips: Array.isArray(cusips) ? cusips : [cusips],
        priority
      });
    } catch (error) {
      next(error);
    }
  },

  async retryFailedCusips(req, res, next) {
    try {
      const cusipQueue = require('../utils/cusipQueue');
      const db = require('../config/database');
      
      // Reset failed CUSIPs to pending
      const query = `
        UPDATE cusip_lookup_queue 
        SET status = 'pending', attempts = 0, error_message = NULL
        WHERE status = 'failed'
        RETURNING cusip
      `;
      
      const result = await db.query(query);
      const retriedCusips = result.rows.map(row => row.cusip);
      
      res.json({ 
        message: `Reset ${retriedCusips.length} failed CUSIPs for retry`,
        cusips: retriedCusips
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = tradeController;