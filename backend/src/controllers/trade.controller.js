const Trade = require('../models/Trade');
const { parseCSV } = require('../utils/csvParser');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');
const cusipLookup = require('../utils/cusipLookup');

const tradeController = {
  async getUserTrades(req, res, next) {
    try {
      const { symbol, startDate, endDate, tags, strategy, limit = 50, offset = 0 } = req.query;
      
      const filters = {
        symbol,
        startDate,
        endDate,
        tags: tags ? tags.split(',') : undefined,
        strategy,
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
      const result = await Trade.delete(req.params.id, req.user.id);
      
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

      const query = `
        INSERT INTO trade_comments (trade_id, user_id, comment)
        VALUES ($1, $2, $3)
        RETURNING *
      `;

      const result = await db.query(query, [req.params.id, req.user.id, comment]);
      
      res.status(201).json({ comment: result.rows[0] });
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
          const trades = await parseCSV(req.file.buffer, broker);
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

      const ticker = await cusipLookup.lookupTicker(cusip);
      
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

      // Add the mapping
      cusipLookup.addMapping(cleanCusip, cleanTicker);
      
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
      const mappings = cusipLookup.cache;
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
      
      // Check if mapping exists
      if (!cusipLookup.cache[cleanCusip]) {
        return res.status(404).json({ error: 'CUSIP mapping not found' });
      }

      const deletedTicker = cusipLookup.cache[cleanCusip];
      
      // Remove the mapping
      const removed = cusipLookup.removeMapping(cleanCusip);
      
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
      // Find all trades with CUSIP-like symbols that aren't in cache
      const cacheKeys = Object.keys(cusipLookup.cache);
      let cusipQuery;
      let queryParams;
      
      if (cacheKeys.length === 0) {
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
          AND symbol NOT IN (${cacheKeys.map((_, i) => `$${i + 2}`).join(',')})
        `;
        queryParams = [req.user.id, ...cacheKeys];
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
      
      // Resolve CUSIPs using full lookup pipeline
      const resolvedMappings = await cusipLookup.lookupBatch(unresolvedCusips);
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
  }
};

module.exports = tradeController;