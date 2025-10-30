const Trade = require('../models/Trade');
const User = require('../models/User');
const { parseCSV } = require('../utils/csvParser');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const logger = require('../utils/logger');
const finnhub = require('../utils/finnhub');
const cache = require('../utils/cache');
const symbolCategories = require('../utils/symbolCategories');
const imageProcessor = require('../utils/imageProcessor');
const upload = require('../middleware/upload');
const currencyConverter = require('../utils/currencyConverter');
const path = require('path');
const fs = require('fs').promises;
const ChartService = require('../services/chartService');

const tradeController = {
  async getUserTrades(req, res, next) {
    try {
      const {
        symbol, startDate, endDate, tags, strategy, sector,
        strategies, sectors, hasNews, daysOfWeek, instrumentTypes, optionTypes, qualityGrades,
        side, minPrice, maxPrice, minQuantity, maxQuantity,
        status, minPnl, maxPnl, pnlType, broker, brokers,
        limit = 50, offset = 0
      } = req.query;

      const filters = {
        symbol,
        startDate,
        endDate,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        strategy,
        sector,
        // Multi-select filters
        strategies: strategies ? strategies.split(',') : undefined,
        sectors: sectors ? sectors.split(',') : undefined,
        hasNews,
        daysOfWeek: daysOfWeek ? daysOfWeek.split(',').map(d => parseInt(d)) : undefined,
        instrumentTypes: instrumentTypes ? instrumentTypes.split(',') : undefined,
        optionTypes: optionTypes ? optionTypes.split(',') : undefined,
        qualityGrades: qualityGrades ? qualityGrades.split(',') : undefined,
        // New advanced filters
        side,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        minQuantity: minQuantity ? parseInt(minQuantity) : undefined,
        maxQuantity: maxQuantity ? parseInt(maxQuantity) : undefined,
        status,
        minPnl: (minPnl !== undefined && minPnl !== null && minPnl !== '') ? parseFloat(minPnl) : undefined,
        maxPnl: (maxPnl !== undefined && maxPnl !== null && maxPnl !== '') ? parseFloat(maxPnl) : undefined,
        pnlType,
        broker, // Keep for backward compatibility
        brokers, // New multi-select broker filter
        // Pagination
        limit: parseInt(limit),
        offset: parseInt(offset)
      };

      if (filters.tags && filters.tags.length > 0) {
        console.log('[TAGS] Filtering by tags:', filters.tags);
      }

      if (filters.qualityGrades && filters.qualityGrades.length > 0) {
        console.log('[QUALITY] Filtering by quality grades:', filters.qualityGrades);
      }

      // Get trades with pagination
      const trades = await Trade.findByUser(req.user.id, filters);

      // Map snake_case database fields to camelCase for API response
      trades.forEach(trade => {
        if (trade.contract_month !== undefined) trade.contractMonth = trade.contract_month;
        if (trade.contract_year !== undefined) trade.contractYear = trade.contract_year;
        if (trade.underlying_asset !== undefined) trade.underlyingAsset = trade.underlying_asset;
        if (trade.instrument_type !== undefined) trade.instrumentType = trade.instrument_type;
        if (trade.strike_price !== undefined) trade.strikePrice = trade.strike_price;
        if (trade.expiration_date !== undefined) trade.expirationDate = trade.expiration_date;
        if (trade.option_type !== undefined) trade.optionType = trade.option_type;
        if (trade.contract_size !== undefined) trade.contractSize = trade.contract_size;
        if (trade.underlying_symbol !== undefined) trade.underlyingSymbol = trade.underlying_symbol;
        if (trade.point_value !== undefined) trade.pointValue = trade.point_value;
        if (trade.tick_size !== undefined) trade.tickSize = trade.tick_size;
        if (trade.stop_loss !== undefined) trade.stopLoss = trade.stop_loss;
        if (trade.take_profit !== undefined) trade.takeProfit = trade.take_profit;
        if (trade.r_value !== undefined) trade.rValue = trade.r_value;
        if (trade.quality_grade !== undefined) trade.qualityGrade = trade.quality_grade;
        if (trade.quality_score !== undefined) trade.qualityScore = trade.quality_score;
        if (trade.quality_metrics !== undefined) trade.qualityMetrics = trade.quality_metrics;
      });

      // Get total count without pagination
      const totalCountFilters = { ...filters };
      delete totalCountFilters.limit;
      delete totalCountFilters.offset;

      // Use getCountWithFilters for regular trades table counting
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

  async exportTradesToCSV(req, res, next) {
    try {
      const {
        symbol, startDate, endDate, tags, strategy, sector,
        strategies, sectors, hasNews, daysOfWeek, instrumentTypes, optionTypes, qualityGrades,
        side, minPrice, maxPrice, minQuantity, maxQuantity,
        status, minPnl, maxPnl, pnlType, broker, brokers
      } = req.query;

      const filters = {
        symbol,
        startDate,
        endDate,
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        strategy,
        sector,
        strategies: strategies ? strategies.split(',') : undefined,
        sectors: sectors ? sectors.split(',') : undefined,
        hasNews,
        daysOfWeek: daysOfWeek ? daysOfWeek.split(',').map(d => parseInt(d)) : undefined,
        instrumentTypes: instrumentTypes ? instrumentTypes.split(',') : undefined,
        optionTypes: optionTypes ? optionTypes.split(',') : undefined,
        qualityGrades: qualityGrades ? qualityGrades.split(',') : undefined,
        side,
        minPrice: minPrice ? parseFloat(minPrice) : undefined,
        maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
        minQuantity: minQuantity ? parseInt(minQuantity) : undefined,
        maxQuantity: maxQuantity ? parseInt(maxQuantity) : undefined,
        status,
        minPnl: (minPnl !== undefined && minPnl !== null && minPnl !== '') ? parseFloat(minPnl) : undefined,
        maxPnl: (maxPnl !== undefined && maxPnl !== null && maxPnl !== '') ? parseFloat(maxPnl) : undefined,
        pnlType,
        broker,
        brokers: brokers ? brokers.split(',') : undefined,
        // No pagination - export all matching trades
        limit: 999999,
        offset: 0
      };

      const trades = await Trade.findByUser(req.user.id, filters);

      // Convert trades to CSV format with generic headers
      const csvHeaders = [
        'Symbol',
        'Side',
        'Quantity',
        'Entry Price',
        'Exit Price',
        'Entry Date',
        'Exit Date',
        'P&L',
        'Fees',
        'Commission',
        'Notes',
        'Strategy',
        'Setup',
        'Tags',
        'Broker',
        'Status',
        'Instrument Type',
        'Option Type',
        'Strike Price',
        'Expiration Date',
        'Quality Grade'
      ].join(',');

      const csvRows = trades.map(trade => {
        // Helper function to escape CSV values
        const escapeCsv = (value) => {
          if (value === null || value === undefined) return '';
          const str = String(value);
          // If the value contains comma, newline, or quotes, wrap in quotes and escape quotes
          if (str.includes(',') || str.includes('\n') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        // Format dates
        const formatDate = (date) => {
          if (!date) return '';
          return new Date(date).toISOString().split('T')[0]; // YYYY-MM-DD
        };

        return [
          escapeCsv(trade.symbol),
          escapeCsv(trade.side),
          escapeCsv(trade.quantity),
          escapeCsv(trade.entry_price),
          escapeCsv(trade.exit_price),
          formatDate(trade.entry_date),
          formatDate(trade.exit_date),
          escapeCsv(trade.pnl),
          escapeCsv(trade.fees),
          escapeCsv(trade.commission),
          escapeCsv(trade.notes),
          escapeCsv(trade.strategy),
          escapeCsv(trade.setup),
          escapeCsv(trade.tags ? trade.tags.join('; ') : ''),
          escapeCsv(trade.broker),
          escapeCsv(trade.status || (trade.exit_price ? 'Closed' : 'Open')),
          escapeCsv(trade.instrument_type),
          escapeCsv(trade.option_type),
          escapeCsv(trade.strike_price),
          formatDate(trade.expiration_date),
          escapeCsv(trade.quality_grade)
        ].join(',');
      });

      const csv = [csvHeaders, ...csvRows].join('\n');

      // Generate filename with date
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `tradetally-export-${timestamp}.csv`;

      // Set headers for CSV download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);

      logger.logInfo(`Exported ${trades.length} trades to CSV for user ${req.user.id}`);
    } catch (error) {
      logger.logError('Error exporting trades to CSV:', error);
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
        minPnl: (minPnl !== undefined && minPnl !== null && minPnl !== '') ? parseFloat(minPnl) : undefined,
        maxPnl: (maxPnl !== undefined && maxPnl !== null && maxPnl !== '') ? parseFloat(maxPnl) : undefined,
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
      // Log incoming trade data for debugging
      if (req.body.strategy || req.body.setup) {
        console.log(`[TRADE CONTROLLER] Creating trade with strategy="${req.body.strategy || 'null'}", setup="${req.body.setup || 'null'}"`);
      }
      const trade = await Trade.create(req.user.id, req.body);
      
      // Invalidate sector performance cache for this user since new trade was added
      try {
        await cache.invalidate('sector_performance');
        console.log('[SUCCESS] Sector performance cache invalidated after trade creation');
      } catch (cacheError) {
        console.warn('[WARNING] Failed to invalidate sector performance cache:', cacheError.message);
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

      // Parse quality_metrics JSON if it exists
      if (trade.quality_metrics && typeof trade.quality_metrics === 'string') {
        try {
          trade.quality_metrics = JSON.parse(trade.quality_metrics);
        } catch (e) {
          console.warn('Failed to parse quality_metrics JSON:', e);
          trade.quality_metrics = null;
        }
      }

      // Normalize executions to ensure 'action' field exists
      if (trade.executions && Array.isArray(trade.executions)) {
        trade.executions = trade.executions.map(exec => {
          // If execution has 'side' but not 'action', copy it to 'action'
          if (!exec.action && exec.side) {
            exec.action = exec.side;
          }
          return exec;
        });
      }

      // Map snake_case database fields to camelCase for API response
      // This ensures frontend compatibility
      if (trade.contract_month !== undefined) trade.contractMonth = trade.contract_month;
      if (trade.contract_year !== undefined) trade.contractYear = trade.contract_year;
      if (trade.underlying_asset !== undefined) trade.underlyingAsset = trade.underlying_asset;
      if (trade.instrument_type !== undefined) trade.instrumentType = trade.instrument_type;
      if (trade.strike_price !== undefined) trade.strikePrice = trade.strike_price;
      if (trade.expiration_date !== undefined) trade.expirationDate = trade.expiration_date;
      if (trade.option_type !== undefined) trade.optionType = trade.option_type;
      if (trade.contract_size !== undefined) trade.contractSize = trade.contract_size;
      if (trade.underlying_symbol !== undefined) trade.underlyingSymbol = trade.underlying_symbol;
      if (trade.point_value !== undefined) trade.pointValue = trade.point_value;
      if (trade.tick_size !== undefined) trade.tickSize = trade.tick_size;
      if (trade.stop_loss !== undefined) trade.stopLoss = trade.stop_loss;
      if (trade.take_profit !== undefined) trade.takeProfit = trade.take_profit;
      if (trade.r_value !== undefined) trade.rValue = trade.r_value;

      // Map quality grading fields
      if (trade.quality_grade !== undefined) trade.qualityGrade = trade.quality_grade;
      if (trade.quality_score !== undefined) trade.qualityScore = trade.quality_score;
      if (trade.quality_metrics !== undefined) trade.qualityMetrics = trade.quality_metrics;

      res.json({ trade });
    } catch (error) {
      next(error);
    }
  },

  async updateTrade(req, res, next) {
    try {
      // Log incoming update data for debugging
      if (req.body.strategy !== undefined || req.body.setup !== undefined) {
        console.log(`[TRADE CONTROLLER] Updating trade ${req.params.id} with strategy="${req.body.strategy || 'null'}", setup="${req.body.setup || 'null'}"`);
      }
      const trade = await Trade.update(req.params.id, req.user.id, req.body);
      
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Invalidate sector performance cache for this user since trade data changed
      try {
        await cache.invalidate('sector_performance');
        console.log('[SUCCESS] Sector performance cache invalidated after trade update');
      } catch (cacheError) {
        console.warn('[WARNING] Failed to invalidate sector performance cache:', cacheError.message);
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
        console.log('[SUCCESS] Sector performance cache invalidated after trade deletion');
      } catch (cacheError) {
        console.warn('[WARNING] Failed to invalidate sector performance cache:', cacheError.message);
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

      // Validate all trade IDs are UUIDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const tradeId of tradeIds) {
        if (!uuidRegex.test(tradeId)) {
          return res.status(400).json({ error: `Invalid trade ID format: ${tradeId}` });
        }
      }

      let deletedCount = 0;
      let errors = [];

      // Delete each trade individually to ensure permissions and proper cleanup
      for (const tradeId of tradeIds) {
        try {
          // Verify trade exists and belongs to user
          const trade = await Trade.findById(tradeId, req.user.id);
          
          if (!trade) {
            errors.push({ tradeId, error: 'Trade not found or access denied' });
            continue;
          }

          // Delete the trade
          const result = await Trade.delete(tradeId, req.user.id);
          
          if (result) {
            deletedCount++;
          } else {
            errors.push({ tradeId, error: 'Failed to delete trade' });
          }
        } catch (error) {
          errors.push({ tradeId, error: error.message });
        }
      }

      // Invalidate sector performance cache
      try {
        await cache.invalidate('sector_performance');
        console.log('[SUCCESS] Sector performance cache invalidated after bulk trade deletion');
      } catch (cacheError) {
        console.warn('[WARNING] Failed to invalidate sector performance cache:', cacheError.message);
      }

      res.json({
        message: `Bulk delete completed. ${deletedCount} trades deleted successfully.`,
        deletedCount,
        totalRequested: tradeIds.length,
        errors
      });
    } catch (error) {
      next(error);
    }
  },

  async bulkAddTags(req, res, next) {
    try {
      const { tradeIds, tags } = req.body;

      if (!tradeIds || !Array.isArray(tradeIds) || tradeIds.length === 0) {
        return res.status(400).json({ error: 'Trade IDs array is required' });
      }

      if (!tags || !Array.isArray(tags) || tags.length === 0) {
        return res.status(400).json({ error: 'Tags array is required' });
      }

      // Validate all trade IDs are UUIDs
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      for (const tradeId of tradeIds) {
        if (!uuidRegex.test(tradeId)) {
          return res.status(400).json({ error: `Invalid trade ID format: ${tradeId}` });
        }
      }

      // Ensure tags exist in tags table
      await Trade.ensureTagsExist(req.user.id, tags);

      let updatedCount = 0;
      let errors = [];

      // Update each trade individually to ensure permissions
      for (const tradeId of tradeIds) {
        try {
          // Get current trade to merge tags
          const trade = await Trade.findById(tradeId, req.user.id);

          if (!trade) {
            errors.push({ tradeId, error: 'Trade not found or access denied' });
            continue;
          }

          // Merge new tags with existing tags (avoid duplicates)
          const existingTags = trade.tags || [];
          const mergedTags = [...new Set([...existingTags, ...tags])];

          // Update the trade with merged tags
          await Trade.update(tradeId, req.user.id, { tags: mergedTags });
          updatedCount++;
        } catch (error) {
          errors.push({ tradeId, error: error.message });
        }
      }

      res.json({
        message: `Bulk tag update completed. ${updatedCount} trades updated successfully.`,
        updatedCount,
        totalRequested: tradeIds.length,
        errors
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
      const { broker = 'generic', mappingId = null } = req.body;

      console.log('Selected broker:', broker);
      console.log('Mapping ID:', mappingId);
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

      // Copy file buffer and metadata to prevent issues if request is cleaned up
      const fileBuffer = Buffer.from(req.file.buffer);
      const fileName = req.file.originalname;
      const fileUserId = req.user.id;

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
          logger.logImport(`Starting import for user ${fileUserId}, broker: ${broker}, file: ${fileName}`);
          
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
          const openPositionsResult = await db.query(openPositionsQuery, [fileUserId]);
          logger.logImport(`Found ${openPositionsResult.rows.length} existing open positions`);
          
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

          // Fetch user settings for trade grouping configuration
          let userSettings = await User.getSettings(req.user.id);
          if (!userSettings) {
            userSettings = await User.createSettings(req.user.id);
          }

          // Fetch custom mapping if provided
          let customMapping = null;
          if (mappingId) {
            logger.logImport(`Fetching custom CSV mapping: ${mappingId}`);
            const mappingQuery = `
              SELECT * FROM custom_csv_mappings
              WHERE id = $1 AND user_id = $2
            `;
            const mappingResult = await db.query(mappingQuery, [mappingId, fileUserId]);
            if (mappingResult.rows.length > 0) {
              customMapping = mappingResult.rows[0];
              logger.logImport(`Using custom mapping: ${customMapping.mapping_name}`);
            } else {
              logger.logWarn(`Custom mapping ${mappingId} not found for user ${fileUserId}`);
            }
          }

          const context = {
            existingPositions,
            userId: req.user.id,
            tradeGroupingSettings: {
              enabled: userSettings.enable_trade_grouping ?? true,
              timeGapMinutes: userSettings.trade_grouping_time_gap_minutes ?? 60
            },
            customMapping
          };
          const parseResult = await parseCSV(fileBuffer, broker, context);

          // Handle both old format (array) and new format (object with trades and unresolvedCusips)
          let trades = Array.isArray(parseResult) ? parseResult : parseResult.trades;
          const unresolvedCusips = parseResult.unresolvedCusips || [];

          logger.logImport(`Parsed ${trades.length} trades from CSV`);

          // Check tier limits for batch import
          const TierService = require('../services/tierService');
          const importCheck = await TierService.canImportTrades(fileUserId, trades.length);

          if (!importCheck.allowed) {
            logger.logImport(`Import blocked by tier limit: ${importCheck.message}`);
            await db.query(`
              UPDATE import_logs
              SET status = 'failed',
                  error_details = $1,
                  completed_at = CURRENT_TIMESTAMP
              WHERE id = $2
            `, [{ error: importCheck.message, tier: importCheck.tier }, importId]);

            throw new Error(importCheck.message);
          }

          logger.logImport(`Tier check passed: ${importCheck.tier} tier, importing ${trades.length} trades (max per import: ${importCheck.max || 'unlimited'})`);

          // Apply currency conversion if a currency column was detected
          if (context.hasCurrencyColumn && context.currencyRecords) {
            logger.logImport('[CURRENCY] Applying currency conversion to parsed trades');

            // Build a map of currency values from the original CSV records
            const currencyMap = new Map();
            const currencyFieldPatterns = ['currency', 'curr', 'ccy', 'currency_code', 'currencycode'];

            context.currencyRecords.forEach((record, index) => {
              for (const fieldName of Object.keys(record)) {
                const lowerFieldName = fieldName.toLowerCase().trim();

                if (currencyFieldPatterns.some(pattern => lowerFieldName.includes(pattern))) {
                  const value = record[fieldName];
                  if (value && value.toString().trim() !== '') {
                    const currencyValue = value.toString().toUpperCase().trim();
                    currencyMap.set(index, currencyValue);
                    break;
                  }
                }
              }
            });

            // Convert each trade
            const convertedTrades = [];
            for (let i = 0; i < trades.length; i++) {
              const trade = trades[i];
              const currency = currencyMap.get(i) || 'USD';

              if (currency && currency !== 'USD') {
                try {
                  const tradeDate = trade.tradeDate || trade.entryTime?.split('T')[0];
                  const convertedTrade = await currencyConverter.convertTradeToUSD(trade, currency, tradeDate);
                  convertedTrades.push(convertedTrade);
                  logger.logImport(`[CURRENCY] Converted trade ${i + 1}: ${currency} to USD (rate: ${convertedTrade.exchangeRate})`);
                } catch (error) {
                  logger.logImport(`[CURRENCY] Failed to convert trade ${i + 1}: ${error.message}`);
                  // Keep original trade if conversion fails
                  convertedTrades.push(trade);
                }
              } else {
                convertedTrades.push(trade);
              }
            }

            trades = convertedTrades;
            logger.logImport(`[CURRENCY] Completed currency conversion for ${trades.length} trades`);
          }
          
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
              // Skip duplicate detection for trades that are updates to existing positions
              // These trades have isUpdate=true and existingTradeId set by the parser
              if (tradeData.isUpdate && tradeData.existingTradeId) {
                // This is an update to an existing trade, not a duplicate
                logger.logImport(`Processing update for existing trade ${tradeData.existingTradeId}: ${tradeData.symbol}`);
              } else {
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
                  pnl, pnlPercent, newExecutionsAdded,
                  ...cleanTradeData
                } = tradeData;
                
                // Keep executions for database update (use 'executions' not 'executionData')
                // Trade.update expects 'executions' which it will merge with existing executions
                if (tradeData.executions) {
                  cleanTradeData.executions = tradeData.executions;
                } else if (executionData) {
                  cleanTradeData.executions = executionData;
                }
                await Trade.update(tradeData.existingTradeId, req.user.id, cleanTradeData, { skipAchievements: true, skipApiCalls: true });
              } else {
                // Add import ID to track which import this trade came from
                tradeData.importId = importId;
                await Trade.create(req.user.id, tradeData, { skipAchievements: true, skipApiCalls: true });
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
            console.log('[SUCCESS] Sector performance cache invalidated after import completion');
          } catch (cacheError) {
            console.warn('[WARNING] Failed to invalidate sector performance cache:', cacheError.message);
          }

          // Check achievements and trigger leaderboard updates after import
          try {
            console.log('[ACHIEVEMENT] Checking achievements after import for user', req.user.id);
            const AchievementService = require('../services/achievementService');
            const newAchievements = await AchievementService.checkAndAwardAchievements(req.user.id);
            console.log(`[ACHIEVEMENT] Post-import achievements awarded: ${newAchievements.length}`);
          } catch (achievementError) {
            console.warn('[WARNING] Failed to check/award achievements after import:', achievementError.message);
          }

          // Background categorization of new symbols
          try {
            console.log('[PROCESS] Starting background symbol categorization after import...');
            // Run categorization in background without blocking the response
            symbolCategories.categorizeNewSymbols(req.user.id).then(result => {
              console.log(`[SUCCESS] Background categorization complete: ${result.processed} of ${result.total} symbols categorized`);
            }).catch(error => {
              console.warn('[WARNING] Background symbol categorization failed:', error.message);
            });
          } catch (error) {
            console.warn('[WARNING] Failed to start background symbol categorization:', error.message);
          }

          // Background news enrichment for imported trades
          try {
            if (imported > 0) {
              console.log(`[PROCESS] Scheduling background news enrichment for ${imported} imported trades...`);
              const jobQueue = require('../utils/jobQueue');
              await jobQueue.addJob('news_enrichment', {
                userId: req.user.id,
                importId: importId,
                tradeCount: imported
              });
              console.log('[SUCCESS] News enrichment job queued');
            }
          } catch (error) {
            console.warn('[WARNING] Failed to queue news enrichment job:', error.message);
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

      // Parse executions JSON for each trade
      openTrades.forEach(trade => {
        if (trade.executions) {
          try {
            trade.executions = typeof trade.executions === 'string'
              ? JSON.parse(trade.executions)
              : trade.executions;
          } catch (error) {
            console.warn(`Failed to parse executions for trade ${trade.id}:`, error.message);
            trade.executions = [];
          }
        }
      });

      // Helper function to calculate net position from executions
      const calculateNetPosition = (trade) => {
        // If trade has executions, calculate net position from them
        if (trade.executions && Array.isArray(trade.executions) && trade.executions.length > 0) {
          let netPosition = 0;
          trade.executions.forEach(execution => {
            const qty = parseFloat(execution.quantity) || 0;
            const action = execution.action || execution.side || 'unknown';

            if (action === 'buy' || action === 'long') {
              netPosition += qty;
            } else if (action === 'sell' || action === 'short') {
              netPosition -= qty;
            }
          });
          return netPosition;
        }

        // Fallback to trade.quantity if no executions
        return trade.side === 'long' ? trade.quantity : -trade.quantity;
      };

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
            avgPrice: 0,
            instrumentType: trade.instrument_type || 'stock',
            contractSize: trade.contract_size || 1
          };
        }

        positionMap[trade.symbol].trades.push(trade);

        // Calculate net position considering executions or trade direction
        const netPosition = calculateNetPosition(trade);
        positionMap[trade.symbol].totalQuantity += netPosition;

        // For cost calculation, account for contract size (options/futures multiplier)
        const contractMultiplier = trade.instrument_type === 'option' || trade.instrument_type === 'future'
          ? (trade.contract_size || 100)
          : 1;
        positionMap[trade.symbol].totalCost += Math.abs(netPosition) * trade.entry_price * contractMultiplier;
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

        // Get contract multiplier from the first trade in the position
        const firstTrade = position.trades[0];
        const contractMultiplier = firstTrade.instrument_type === 'option' || firstTrade.instrument_type === 'future'
          ? (firstTrade.contract_size || 100)
          : 1;

        // avgPrice should be per-share price, so divide totalCost by (quantity * multiplier)
        position.avgPrice = position.totalCost / (absQuantity * contractMultiplier);
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
            // Account for contract multiplier in current value calculation
            const contractMultiplier = position.instrumentType === 'option' || position.instrumentType === 'future'
              ? (position.contractSize || 100)
              : 1;
            const currentValue = currentPrice * position.totalQuantity * contractMultiplier;
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

      // Delete trades using the import_id foreign key (CASCADE will handle this automatically)
      // But we'll explicitly delete to count the trades removed
      const deleteTradesQuery = `
        DELETE FROM trades
        WHERE user_id = $1 AND import_id = $2
        RETURNING id
      `;

      const deletedTrades = await db.query(deleteTradesQuery, [
        req.user.id,
        importId
      ]);

      // Delete the import log (CASCADE will delete any remaining trades if any)
      await db.query(`DELETE FROM import_logs WHERE id = $1`, [importId]);

      // Invalidate sector performance cache for this user
      try {
        await cache.invalidate('sector_performance');
        console.log('[SUCCESS] Sector performance cache invalidated after import deletion');
      } catch (cacheError) {
        console.warn('[WARNING] Failed to invalidate sector performance cache:', cacheError.message);
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
      const { showAll = 'false', page = 1, limit = 10 } = req.query;
      const showAllBool = showAll === 'true';
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      
      const result = logger.getLogFiles(showAllBool, pageNum, limitNum);
      
      res.json({ 
        logFiles: result.files.map(f => ({ name: f.name })),
        pagination: result.pagination
      });
    } catch (error) {
      next(error);
    }
  },

  async getLogFile(req, res, next) {
    try {
      const filename = req.params.filename;
      const { page = 1, limit = 100, showAll = 'false', search = '' } = req.query;
      const showAllBool = showAll === 'true';
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      
      const result = logger.readLogFile(filename, pageNum, limitNum, showAllBool, search);
      
      if (!result) {
        return res.status(404).json({ error: 'Log file not found' });
      }

      res.json({ 
        filename, 
        content: result.content,
        pagination: result.pagination
      });
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
        startDate, endDate, symbol, sector, strategy, tags,
        strategies, sectors, // Add multi-select parameters
        side, minPrice, maxPrice, minQuantity, maxQuantity,
        status, minPnl, maxPnl, pnlType, broker, brokers, hasNews,
        holdTime, minHoldTime, maxHoldTime, daysOfWeek, instrumentTypes, optionTypes, qualityGrades
      } = req.query;

      const filters = {
        startDate,
        endDate,
        symbol,
        sector,
        strategy,
        // Multi-select filters
        tags: tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
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
        broker: broker || undefined,
        brokers: brokers || undefined,  // Support both broker and brokers
        hasNews,
        holdTime,
        daysOfWeek: daysOfWeek ? daysOfWeek.split(',').map(d => parseInt(d)) : undefined,
        instrumentTypes: instrumentTypes ? instrumentTypes.split(',') : undefined,
        optionTypes: optionTypes ? optionTypes.split(',') : undefined,
        qualityGrades: qualityGrades ? qualityGrades.split(',') : undefined
      };
      
      console.log('[ANALYTICS] Raw query:', req.query);
      console.log('[ANALYTICS] Parsed filters:', JSON.stringify(filters, null, 2));

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

  async getMonthlyPerformance(req, res, next) {
    try {
      const year = parseInt(req.query.year) || new Date().getFullYear();

      console.log('[MONTHLY] Getting monthly performance for user:', req.user.id, 'year:', year);

      const data = await Trade.getMonthlyPerformance(req.user.id, year);

      res.json({
        year,
        ...data
      });
    } catch (error) {
      console.error('[ERROR] Monthly performance error:', error);
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

  async getSetupList(req, res, next) {
    try {
      const setups = await Trade.getSetupList(req.user.id);
      res.json({ setups });
    } catch (error) {
      next(error);
    }
  },

  async getBrokerList(req, res, next) {
    try {
      const brokers = await Trade.getBrokerList(req.user.id);
      res.json({ brokers });
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
      // Find all CUSIP-like symbols that don't have mappings
      const cusipQuery = `
        SELECT DISTINCT t.symbol 
        FROM trades t
        LEFT JOIN cusip_mappings cm ON cm.cusip = t.symbol AND (cm.user_id = $1 OR cm.user_id IS NULL)
        WHERE t.user_id = $1 
          AND LENGTH(t.symbol) = 9 
          AND t.symbol ~ '^[0-9A-Z]{9}$'
          AND cm.cusip IS NULL
      `;
      
      const result = await db.query(cusipQuery, [req.user.id]);
      const unresolvedCusips = result.rows.map(row => row.symbol);
      
      if (unresolvedCusips.length === 0) {
        return res.json({ 
          message: 'No unresolved CUSIPs found',
          resolved: 0,
          total: 0
        });
      }

      console.log(`Found ${unresolvedCusips.length} unresolved CUSIPs, attempting to resolve...`);
      
      // Send immediate response and continue in background
      res.json({
        message: `Starting resolution of ${unresolvedCusips.length} CUSIPs in background`,
        total: unresolvedCusips.length,
        status: 'processing'
      });
      
      // Copy user ID to avoid reference issues
      const userId = req.user.id;
      
      // Continue processing in background
      process.nextTick(async () => {
        try {
          console.log(`[BACKGROUND] Starting CUSIP resolution for ${unresolvedCusips.length} CUSIPs...`);
          
          let totalMappingsCreated = 0;
          let totalTradesUpdated = 0;
          
          // Define callback function to create mapping immediately when CUSIP is resolved
          const onResolveCallback = async (cusip, ticker, userId) => {
            try {
              // Update trades to replace CUSIP with ticker
              const updateResult = await Trade.updateSymbolForCusip(userId, cusip, ticker);
              const tradesUpdated = updateResult.affectedRows || 0;
              totalTradesUpdated += tradesUpdated;
              
              // Create mapping entry in cusip_mappings table
              console.log(`[MAPPING] Creating immediate mapping: ${cusip} → ${ticker} for user ${userId}`);
              
              const mappingResult = await db.query(
                `INSERT INTO cusip_mappings (cusip, ticker, user_id, verified, resolution_source, created_by) 
                 VALUES ($1, $2, $3, true, 'system_ai', $3) 
                 ON CONFLICT (cusip, user_id) DO NOTHING
                 RETURNING id`,
                [cusip, ticker, userId]
              );
              
              if (mappingResult.rows.length > 0) {
                totalMappingsCreated++;
                console.log(`[MAPPING] [SUCCESS] Immediately created mapping: ${cusip} → ${ticker} (ID: ${mappingResult.rows[0].id}) - ${tradesUpdated} trades updated`);
              } else {
                console.log(`[MAPPING] [WARNING] Mapping already exists: ${cusip} → ${ticker} - ${tradesUpdated} trades updated`);
              }
            } catch (mappingError) {
              console.error(`[MAPPING] [ERROR] Failed to create immediate mapping for ${cusip} → ${ticker}:`, mappingError.message);
              console.error(`[MAPPING] Error details:`, mappingError);
            }
          };
          
          // Resolve CUSIPs using Finnhub batch lookup with immediate callback
          const resolvedMappings = await finnhub.batchLookupCusips(unresolvedCusips, userId, onResolveCallback);
          const resolvedCount = Object.keys(resolvedMappings).length;
          
          console.log(`[BACKGROUND] [SUCCESS] CUSIP resolution complete: ${resolvedCount} of ${unresolvedCusips.length} resolved, ${totalTradesUpdated} trades updated, ${totalMappingsCreated} mappings created immediately`);
        } catch (error) {
          console.error('[BACKGROUND] [ERROR] Error in background CUSIP resolution:', error.message);
          console.error('[BACKGROUND] Full error:', error);
        }
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
      const { startDate, endDate, format = 'csv' } = req.query;

      // Build filters
      const filters = {};
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;

      // Fetch all trades for the user
      const trades = await Trade.findByUser(req.user.id, filters);

      if (format === 'csv') {
        // Define CSV headers - include ALL fields
        const headers = [
          'Symbol',
          'Entry Time',
          'Exit Time',
          'Entry Price',
          'Exit Price',
          'Quantity',
          'Side',
          'Instrument Type',
          'P&L',
          'P&L %',
          'Commission',
          'Entry Commission',
          'Exit Commission',
          'Fees',
          'Broker',
          'Strategy',
          'Setup',
          'Notes',
          'MAE',
          'MFE',
          'Confidence',
          'Tags',
          'Trade Date',
          'Hold Time (minutes)',
          // Options fields
          'Underlying Symbol',
          'Option Type',
          'Strike Price',
          'Expiration Date',
          'Contract Size',
          // Futures fields
          'Underlying Asset',
          'Contract Month',
          'Contract Year',
          'Tick Size',
          'Point Value',
          // Currency fields
          'Currency',
          'Exchange Rate',
          'Original Entry Price (Currency)',
          'Original Exit Price (Currency)',
          'Original P&L (Currency)',
          'Original Commission (Currency)',
          'Original Fees (Currency)'
        ];

        // Convert trades to CSV rows
        const rows = trades.map(trade => [
          trade.symbol,
          trade.entry_time,
          trade.exit_time || '',
          trade.entry_price,
          trade.exit_price || '',
          trade.quantity,
          trade.side,
          trade.instrument_type || 'stock',
          trade.pnl || '',
          trade.pnl_percent || '',
          trade.commission || 0,
          trade.entry_commission || 0,
          trade.exit_commission || 0,
          trade.fees || 0,
          trade.broker || '',
          trade.strategy || '',
          trade.setup || '',
          (trade.notes || '').replace(/"/g, '""'), // Escape quotes in notes
          trade.mae || '',
          trade.mfe || '',
          trade.confidence || '',
          Array.isArray(trade.tags) ? trade.tags.join(';') : '',
          trade.trade_date || '',
          trade.hold_time_minutes || '',
          // Options fields
          trade.underlying_symbol || '',
          trade.option_type || '',
          trade.strike_price || '',
          trade.expiration_date || '',
          trade.contract_size || '',
          // Futures fields
          trade.underlying_asset || '',
          trade.contract_month || '',
          trade.contract_year || '',
          trade.tick_size || '',
          trade.point_value || '',
          // Currency fields
          trade.currency || 'USD',
          trade.exchange_rate || 1,
          trade.original_entry_price_currency || '',
          trade.original_exit_price_currency || '',
          trade.original_pnl_currency || '',
          trade.original_commission_currency || '',
          trade.original_fees_currency || ''
        ]);

        // Build CSV content
        const csvContent = [
          headers.map(h => `"${h}"`).join(','),
          ...rows.map(row => row.map(cell => {
            // Handle null/undefined
            if (cell === null || cell === undefined) return '';
            // Wrap in quotes and escape existing quotes
            return `"${String(cell).replace(/"/g, '""')}"`;
          }).join(','))
        ].join('\n');

        // Set headers for file download
        const filename = `tradetally_export_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);
      } else {
        // JSON format
        res.json({
          trades,
          count: trades.length,
          exportDate: new Date().toISOString()
        });
      }
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
  },

  // Image upload endpoints
  async uploadTradeImages(req, res, next) {
    try {
      const tradeId = req.params.id;
      
      // Verify trade belongs to user
      const trade = await Trade.findById(tradeId, req.user.id);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'No images uploaded' });
      }

      const uploadsDir = path.join(__dirname, '../../uploads/trades');
      const processedImages = [];

      // Process each uploaded image
      for (const file of req.files) {
        try {
          // Validate image
          await imageProcessor.validateImage(file.buffer);

          // Process and compress image
          const processedImage = await imageProcessor.processImage(
            file.buffer, 
            file.originalname, 
            req.user.id, 
            tradeId
          );

          // Save to disk
          const savedImage = await imageProcessor.saveImage(processedImage, uploadsDir);

          // Save to database
          const attachmentData = {
            fileUrl: `/api/trades/${tradeId}/images/${savedImage.filename}`,
            fileType: savedImage.mimeType,
            fileName: file.originalname,
            fileSize: savedImage.size
          };

          const attachment = await Trade.addAttachment(tradeId, attachmentData);
          
          processedImages.push({
            ...attachment,
            originalSize: savedImage.originalSize,
            compressedSize: savedImage.size,
            compressionRatio: savedImage.compressionRatio
          });

        } catch (error) {
          console.error(`Failed to process image ${file.originalname}:`, error);
          processedImages.push({
            filename: file.originalname,
            error: error.message
          });
        }
      }

      res.json({
        message: 'Images processed successfully',
        images: processedImages,
        totalImages: processedImages.length,
        successfulUploads: processedImages.filter(img => !img.error).length
      });

    } catch (error) {
      next(error);
    }
  },

  async getTradeImage(req, res, next) {
    try {
      const { id: tradeId, filename } = req.params;
      
      console.log('getTradeImage called:', {
        tradeId,
        filename,
        hasAuthHeader: !!req.header('Authorization'),
        hasQueryToken: !!req.query.token,
        userFromMiddleware: req.user?.id
      });
      
      // Check if token is provided as query parameter
      let user = req.user;
      if (!user && req.query.token) {
        try {
          const jwt = require('jsonwebtoken');
          const decoded = jwt.verify(req.query.token, process.env.JWT_SECRET);
          user = { id: decoded.id };
        } catch (error) {
          console.log('JWT verification failed for query token:', error.message);
          // Token is invalid, continue without user context
        }
      }
      
      // Check if the attachment exists and belongs to the specified trade
      const attachmentQuery = `
        SELECT ta.*, t.is_public, t.user_id 
        FROM trade_attachments ta 
        JOIN trades t ON ta.trade_id = t.id 
        WHERE ta.trade_id = $1 AND ta.file_url LIKE $2
      `;
      
      const attachmentResult = await db.query(attachmentQuery, [tradeId, `%${filename}`]);
      
      if (attachmentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Image not found' });
      }
      
      const attachment = attachmentResult.rows[0];
      
      // Check access permissions - allow if trade is public, or if user owns the trade
      const hasAccess = attachment.is_public || (user && user.id === attachment.user_id);
      
      if (!hasAccess) {
        console.log('Access denied for image:', {
          filename,
          tradeId,
          userId: user?.id,
          tradeOwnerId: attachment.user_id,
          isPublic: attachment.is_public,
          hasUser: !!user
        });
        return res.status(403).json({ error: 'Access denied' });
      }

      const imagePath = path.join(__dirname, '../../uploads/trades', filename);
      
      // Check if file exists
      try {
        await fs.access(imagePath);
      } catch (error) {
        return res.status(404).json({ error: 'Image file not found on disk' });
      }

      // Set appropriate headers
      res.setHeader('Content-Type', attachment.file_type || 'image/webp');
      res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
      
      // Send file
      res.sendFile(path.resolve(imagePath));

    } catch (error) {
      next(error);
    }
  },

  async deleteTradeImage(req, res, next) {
    try {
      const { id: tradeId, attachmentId } = req.params;
      
      // Verify trade belongs to user
      const trade = await Trade.findById(tradeId, req.user.id);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Get attachment details before deletion
      const attachmentQuery = `
        SELECT ta.* FROM trade_attachments ta
        JOIN trades t ON ta.trade_id = t.id
        WHERE ta.id = $1 AND t.user_id = $2
      `;
      const attachmentResult = await db.query(attachmentQuery, [attachmentId, req.user.id]);
      
      if (attachmentResult.rows.length === 0) {
        return res.status(404).json({ error: 'Image not found' });
      }

      const attachment = attachmentResult.rows[0];

      // Delete from database
      await Trade.deleteAttachment(attachmentId, req.user.id);

      // Delete file from disk
      const filename = path.basename(attachment.file_url);
      const filePath = path.join(__dirname, '../../uploads/trades', filename);
      await imageProcessor.deleteImage(filePath);

      res.json({ message: 'Image deleted successfully' });

    } catch (error) {
      next(error);
    }
  },

  async getEnrichmentStatus(req, res, next) {
    try {
      const userId = req.user.id;
      
      // Get enrichment status for user's trades
      const tradesQuery = `
        SELECT 
          COUNT(*) as total_trades,
          COUNT(CASE WHEN enrichment_status = 'completed' THEN 1 END) as enriched_trades,
          COUNT(CASE WHEN enrichment_status = 'pending' THEN 1 END) as pending_trades,
          COUNT(CASE WHEN enrichment_status = 'failed' THEN 1 END) as failed_trades,
          COUNT(CASE WHEN enrichment_status IS NULL THEN 1 END) as unenriched_trades
        FROM trades 
        WHERE user_id = $1
      `;
      
      const tradesResult = await db.query(tradesQuery, [userId]);
      const stats = tradesResult.rows[0];
      
      // Get enrichment status breakdown for display
      const enrichmentStatusQuery = `
        SELECT enrichment_status, COUNT(*) as count
        FROM trades
        WHERE user_id = $1
        GROUP BY enrichment_status
      `;
      const enrichmentStatusResult = await db.query(enrichmentStatusQuery, [userId]);
      const tradeEnrichment = enrichmentStatusResult.rows;
      
      // Get unresolved CUSIPs (trades with CUSIP-like symbols that haven't been resolved)
      const cusipQuery = `
        SELECT COUNT(DISTINCT t.symbol) as unresolved_cusips
        FROM trades t
        LEFT JOIN cusip_mappings cm ON cm.cusip = t.symbol AND (cm.user_id = $1 OR cm.user_id IS NULL)
        WHERE t.user_id = $1
          AND LENGTH(t.symbol) = 9 
          AND t.symbol ~ '^[0-9A-Z]{9}$'
          AND cm.cusip IS NULL
      `;
      
      const cusipResult = await db.query(cusipQuery, [userId]);
      const unresolvedCusips = parseInt(cusipResult.rows[0].unresolved_cusips) || 0;
      
      // Get failed CUSIP resolution errors for helpful messaging
      let cusipErrors = [];
      if (unresolvedCusips > 0) {
        const errorQuery = `
          SELECT DISTINCT clq.error_message, COUNT(*) as count
          FROM trades t
          LEFT JOIN cusip_lookup_queue clq ON clq.cusip = t.symbol
          WHERE t.user_id = $1
            AND LENGTH(t.symbol) = 9 
            AND t.symbol ~ '^[0-9A-Z]{9}$'
            AND clq.status = 'failed'
            AND clq.error_message IS NOT NULL
          GROUP BY clq.error_message
          ORDER BY count DESC
          LIMIT 5
        `;
        
        const errorResult = await db.query(errorQuery, [userId]);
        cusipErrors = errorResult.rows;
      }
      
      res.json({
        success: true,
        data: {
          totalTrades: parseInt(stats.total_trades),
          enrichedTrades: parseInt(stats.enriched_trades),
          pendingTrades: parseInt(stats.pending_trades),
          failedTrades: parseInt(stats.failed_trades),
          unenrichedTrades: parseInt(stats.unenriched_trades),
          unresolvedCusips: unresolvedCusips,
          cusipErrors: cusipErrors,
          tradeEnrichment: tradeEnrichment,
          completionPercentage: stats.total_trades > 0 
            ? Math.round((stats.enriched_trades / stats.total_trades) * 100)
            : 0
        }
      });

    } catch (error) {
      next(error);
    }
  },

  async forceCompleteEnrichment(req, res, next) {
    try {
      const userId = req.user.id;

      console.log(`[ENRICHMENT] Force completing all enrichment jobs for user ${userId}`);

      // Update all trades with pending or failed enrichment status to completed
      const updateQuery = `
        UPDATE trades
        SET
          enrichment_status = 'completed',
          enrichment_completed_at = CURRENT_TIMESTAMP
        WHERE user_id = $1
          AND (enrichment_status IN ('pending', 'failed') OR enrichment_status IS NULL)
        RETURNING id, symbol, enrichment_status
      `;

      const result = await db.query(updateQuery, [userId]);

      // Clear any pending jobs from the job queue for this user
      const clearJobsQuery = `
        DELETE FROM job_queue
        WHERE user_id = $1
          AND type IN ('strategy_classification', 'cusip_lookup', 'news_enrichment', 'chart_enrichment')
          AND status IN ('pending', 'failed')
        RETURNING id, type
      `;

      const jobsResult = await db.query(clearJobsQuery, [userId]);

      console.log(`[ENRICHMENT] Force completed ${result.rows.length} trades and cleared ${jobsResult.rows.length} jobs for user ${userId}`);

      // Get updated statistics
      const statsQuery = `
        SELECT
          COUNT(*) as total_trades,
          COUNT(CASE WHEN enrichment_status = 'completed' THEN 1 END) as enriched_trades,
          COUNT(CASE WHEN enrichment_status = 'pending' THEN 1 END) as pending_trades,
          COUNT(CASE WHEN enrichment_status = 'failed' THEN 1 END) as failed_trades
        FROM trades
        WHERE user_id = $1
      `;

      const statsResult = await db.query(statsQuery, [userId]);
      const stats = statsResult.rows[0];

      res.json({
        success: true,
        message: `Force completed enrichment for ${result.rows.length} trades`,
        forceCompletedTrades: result.rows.length,
        forceCompletedJobs: jobsResult.rows.length,
        data: {
          tradesUpdated: result.rows.length,
          jobsCleared: jobsResult.rows.length,
          updatedTrades: result.rows.map(r => ({ id: r.id, symbol: r.symbol })),
          clearedJobs: jobsResult.rows.map(j => ({ id: j.id, type: j.type })),
          statistics: {
            totalTrades: parseInt(stats.total_trades),
            enrichedTrades: parseInt(stats.enriched_trades),
            pendingTrades: parseInt(stats.pending_trades),
            failedTrades: parseInt(stats.failed_trades)
          }
        }
      });

    } catch (error) {
      console.error('[ENRICHMENT ERROR] Force complete enrichment failed:', error);
      next(error);
    }
  },

  async updateTradeHealthData(req, res, next) {
    try {
      const tradeId = req.params.id;
      const { heartRate, sleepScore, sleepHours, stressLevel } = req.body;

      // Validate trade belongs to user
      const tradeCheck = await db.query(
        'SELECT id FROM trades WHERE id = $1 AND user_id = $2',
        [tradeId, req.user.id]
      );

      if (tradeCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Update trade with health data
      const query = `
        UPDATE trades
        SET heart_rate = $1, sleep_score = $2, sleep_hours = $3, stress_level = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $5 AND user_id = $6
        RETURNING *
      `;

      const result = await db.query(query, [
        heartRate || null,
        sleepScore || null,
        sleepHours || null,
        stressLevel || null,
        tradeId,
        req.user.id
      ]);

      logger.logInfo(`Updated health data for trade ${tradeId} for user ${req.user.id}`);

      res.json({
        success: true,
        trade: result.rows[0]
      });

    } catch (error) {
      logger.logError('Error updating trade health data:', error);
      next(error);
    }
  },

  async bulkUpdateHealthData(req, res, next) {
    try {
      const { trades } = req.body; // Array of {tradeId, heartRate, sleepScore, sleepHours, stressLevel}

      if (!Array.isArray(trades) || trades.length === 0) {
        return res.status(400).json({ error: 'Trades array is required' });
      }

      let updatedCount = 0;
      const errors = [];

      // Process each trade update
      for (const tradeUpdate of trades) {
        const { tradeId, heartRate, sleepScore, sleepHours, stressLevel } = tradeUpdate;

        try {
          // Validate trade belongs to user
          const tradeCheck = await db.query(
            'SELECT id FROM trades WHERE id = $1 AND user_id = $2',
            [tradeId, req.user.id]
          );

          if (tradeCheck.rows.length === 0) {
            errors.push({ tradeId, error: 'Trade not found' });
            continue;
          }

          // Update trade with health data
          const query = `
            UPDATE trades
            SET heart_rate = $1, sleep_score = $2, sleep_hours = $3, stress_level = $4, updated_at = CURRENT_TIMESTAMP
            WHERE id = $5 AND user_id = $6
          `;

          await db.query(query, [
            heartRate || null,
            sleepScore || null,
            sleepHours || null,
            stressLevel || null,
            tradeId,
            req.user.id
          ]);

          updatedCount++;

        } catch (error) {
          errors.push({ tradeId, error: error.message });
        }
      }

      logger.logInfo(`Bulk updated ${updatedCount} trades with health data for user ${req.user.id}`);

      res.json({
        success: true,
        updatedCount,
        totalRequested: trades.length,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error) {
      logger.logError('Error bulk updating trade health data:', error);
      next(error);
    }
  },

  // Get expired options that are still marked as open
  async getExpiredOptions(req, res, next) {
    try {
      const today = new Date().toISOString().split('T')[0];

      const query = `
        SELECT
          id, symbol, underlying_symbol, quantity, entry_price, entry_time,
          strike_price, expiration_date, option_type, contract_size,
          side, strategy, notes
        FROM trades
        WHERE user_id = $1
          AND instrument_type = 'option'
          AND exit_time IS NULL
          AND expiration_date < $2
        ORDER BY expiration_date DESC, symbol
      `;

      const result = await db.query(query, [req.user.id, today]);

      logger.logInfo(`Found ${result.rows.length} expired options for user ${req.user.id}`);

      res.json({
        success: true,
        count: result.rows.length,
        expiredOptions: result.rows
      });

    } catch (error) {
      logger.logError('Error fetching expired options:', error);
      next(error);
    }
  },

  // Auto-close expired options (bulk operation)
  async autoCloseExpiredOptions(req, res, next) {
    try {
      const { dryRun = false } = req.body;
      const today = new Date().toISOString().split('T')[0];
      const closedAt = new Date();

      // First, get all expired options for this user
      const findQuery = `
        SELECT id, symbol, expiration_date, quantity, entry_price, contract_size
        FROM trades
        WHERE user_id = $1
          AND instrument_type = 'option'
          AND exit_time IS NULL
          AND expiration_date < $2
        ORDER BY expiration_date DESC
      `;

      const expiredOptions = await db.query(findQuery, [req.user.id, today]);

      if (expiredOptions.rows.length === 0) {
        return res.json({
          success: true,
          message: 'No expired options found to close',
          closedCount: 0,
          dryRun
        });
      }

      logger.logInfo(`Found ${expiredOptions.rows.length} expired options for user ${req.user.id}. Dry run: ${dryRun}`);

      if (dryRun) {
        return res.json({
          success: true,
          message: `Would close ${expiredOptions.rows.length} expired option(s)`,
          closedCount: 0,
          dryRun: true,
          options: expiredOptions.rows.map(opt => ({
            id: opt.id,
            symbol: opt.symbol,
            expirationDate: opt.expiration_date,
            quantity: opt.quantity
          }))
        });
      }

      // Auto-close all expired options
      const updateQuery = `
        UPDATE trades
        SET
          exit_time = expiration_date + INTERVAL '16 hours',  -- Set to 4 PM ET on expiration day
          exit_price = 0,  -- Expired worthless
          pnl = -(entry_price * quantity * COALESCE(contract_size, 100)),  -- Total loss
          auto_closed = true,
          auto_close_reason = 'option expired worthless',
          updated_at = $1
        WHERE user_id = $2
          AND instrument_type = 'option'
          AND exit_time IS NULL
          AND expiration_date < $3
        RETURNING id, symbol, expiration_date
      `;

      const result = await db.query(updateQuery, [closedAt, req.user.id, today]);

      logger.logInfo(`Auto-closed ${result.rows.length} expired options for user ${req.user.id}`, {
        closedTrades: result.rows.map(t => ({ id: t.id, symbol: t.symbol, expirationDate: t.expiration_date }))
      });

      res.json({
        success: true,
        message: `Successfully auto-closed ${result.rows.length} expired option(s)`,
        closedCount: result.rows.length,
        closedTrades: result.rows
      });

    } catch (error) {
      logger.logError('Error auto-closing expired options:', error);
      next(error);
    }
  },

  /**
   * Calculate quality grade for a single trade
   */
  async calculateTradeQuality(req, res, next) {
    try {
      const { id } = req.params;
      const tradeQualityService = require('../services/tradeQuality.service');

      // Fetch the trade
      const trade = await Trade.findById(id, req.user.id);
      if (!trade) {
        return res.status(404).json({ error: 'Trade not found' });
      }

      // Calculate quality with user's custom weights and existing news sentiment
      const quality = await tradeQualityService.calculateQuality(
        trade.symbol,
        trade.entry_time,
        trade.entry_price,
        trade.side,
        req.user.id,
        trade.news_sentiment
      );

      if (!quality) {
        return res.status(400).json({
          error: 'Unable to calculate quality. Finnhub API may be unavailable or data not found for this symbol.'
        });
      }

      // Update trade with quality data
      const updateQuery = `
        UPDATE trades
        SET quality_grade = $1,
            quality_score = $2,
            quality_metrics = $3
        WHERE id = $4 AND user_id = $5
        RETURNING *
      `;

      const result = await db.query(updateQuery, [
        quality.grade,
        quality.score,
        JSON.stringify(quality.metrics),
        id,
        req.user.id
      ]);

      logger.info(`Calculated quality for trade ${id}: ${quality.grade} (${quality.score}/5.0) for ${trade.symbol}`);

      res.json({
        success: true,
        trade: result.rows[0],
        quality
      });

    } catch (error) {
      logger.logError('Error calculating trade quality:', error);
      next(error);
    }
  },

  /**
   * Calculate quality grades for multiple trades (batch)
   */
  async calculateBatchQuality(req, res, next) {
    try {
      const { tradeIds } = req.body;
      const tradeQualityService = require('../services/tradeQuality.service');

      if (!Array.isArray(tradeIds) || tradeIds.length === 0) {
        return res.status(400).json({ error: 'tradeIds must be a non-empty array' });
      }

      // Fetch trades
      const tradesQuery = `
        SELECT id, symbol, entry_time, entry_price
        FROM trades
        WHERE id = ANY($1) AND user_id = $2
      `;
      const tradesResult = await db.query(tradesQuery, [tradeIds, req.user.id]);

      if (tradesResult.rows.length === 0) {
        return res.status(404).json({ error: 'No trades found' });
      }

      // Calculate quality for each trade
      const results = await tradeQualityService.calculateBatchQuality(tradesResult.rows);

      // Update trades with quality data
      const updates = [];
      for (const result of results) {
        if (result.quality) {
          const updateQuery = `
            UPDATE trades
            SET quality_grade = $1,
                quality_score = $2,
                quality_metrics = $3
            WHERE id = $4 AND user_id = $5
          `;
          updates.push(
            db.query(updateQuery, [
              result.quality.grade,
              result.quality.score,
              JSON.stringify(result.quality.metrics),
              result.tradeId,
              req.user.id
            ])
          );
        }
      }

      await Promise.all(updates);

      logger.logInfo(`Calculated quality for ${updates.length} trades`, {
        userId: req.user.id,
        tradesUpdated: updates.length
      });

      res.json({
        success: true,
        message: `Quality calculated for ${updates.length} trade(s)`,
        results: results.map(r => ({
          tradeId: r.tradeId,
          grade: r.quality?.grade,
          score: r.quality?.score
        }))
      });

    } catch (error) {
      logger.logError('Error calculating batch quality:', error);
      next(error);
    }
  },

  /**
   * Calculate quality for all user trades (async job)
   */
  async calculateAllTradesQuality(req, res, next) {
    try {
      const tradeQualityService = require('../services/tradeQuality.service');

      // Get all trades for user
      const tradesQuery = `
        SELECT id, symbol, entry_time, entry_price
        FROM trades
        WHERE user_id = $1
        ORDER BY entry_time DESC
      `;
      const tradesResult = await db.query(tradesQuery, [req.user.id]);

      if (tradesResult.rows.length === 0) {
        return res.json({
          success: true,
          message: 'No trades found to calculate quality for'
        });
      }

      logger.logInfo(`Starting quality calculation for ${tradesResult.rows.length} trades`, {
        userId: req.user.id
      });

      // Start async processing (don't await)
      setImmediate(async () => {
        try {
          const results = await tradeQualityService.calculateBatchQuality(tradesResult.rows);

          const updates = [];
          for (const result of results) {
            if (result.quality) {
              const updateQuery = `
                UPDATE trades
                SET quality_grade = $1,
                    quality_score = $2,
                    quality_metrics = $3
                WHERE id = $4 AND user_id = $5
              `;
              updates.push(
                db.query(updateQuery, [
                  result.quality.grade,
                  result.quality.score,
                  JSON.stringify(result.quality.metrics),
                  result.tradeId,
                  req.user.id
                ])
              );
            }
          }

          await Promise.all(updates);

          logger.logInfo(`Completed quality calculation for ${updates.length} trades`, {
            userId: req.user.id
          });
        } catch (error) {
          logger.logError('Error in async quality calculation:', error);
        }
      });

      // Return immediately
      res.json({
        success: true,
        message: `Quality calculation started for ${tradesResult.rows.length} trade(s). This may take a few minutes.`,
        totalTrades: tradesResult.rows.length
      });

    } catch (error) {
      logger.logError('Error starting quality calculation:', error);
      next(error);
    }
  }
};

module.exports = tradeController;