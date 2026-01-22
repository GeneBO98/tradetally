const db = require('../config/database');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

const csvMappingController = {
  // Get all CSV mappings for the current user
  async getUserMappings(req, res, next) {
    try {
      const userId = req.user.id;

      const query = `
        SELECT
          id,
          mapping_name,
          description,
          symbol_column,
          side_column,
          quantity_column,
          entry_price_column,
          exit_price_column,
          entry_date_column,
          exit_date_column,
          pnl_column,
          fees_column,
          notes_column,
          stop_loss_column,
          take_profit_column,
          date_format,
          delimiter,
          has_header_row,
          parsing_options,
          created_at,
          updated_at,
          last_used_at,
          use_count
        FROM custom_csv_mappings
        WHERE user_id = $1
        ORDER BY last_used_at DESC NULLS LAST, created_at DESC
      `;

      const result = await db.query(query, [userId]);

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error) {
      logger.logError('Error fetching CSV mappings:', error);
      next(error);
    }
  },

  // Get a specific CSV mapping by ID
  async getMappingById(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const query = `
        SELECT *
        FROM custom_csv_mappings
        WHERE id = $1 AND user_id = $2
      `;

      const result = await db.query(query, [id, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'CSV mapping not found'
        });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.logError('Error fetching CSV mapping:', error);
      next(error);
    }
  },

  // Create a new CSV mapping
  async createMapping(req, res, next) {
    try {
      const userId = req.user.id;
      const {
        mapping_name,
        description,
        symbol_column,
        side_column,
        quantity_column,
        entry_price_column,
        exit_price_column,
        entry_date_column,
        exit_date_column,
        pnl_column,
        fees_column,
        notes_column,
        date_format,
        delimiter,
        has_header_row,
        parsing_options
      } = req.body;

      // Validation
      if (!mapping_name || !mapping_name.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Mapping name is required'
        });
      }

      // Check for duplicate mapping name
      const duplicateCheck = await db.query(
        'SELECT id FROM custom_csv_mappings WHERE user_id = $1 AND mapping_name = $2',
        [userId, mapping_name.trim()]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'A mapping with this name already exists'
        });
      }

      // Validate that at least symbol, quantity, and entry_price are mapped
      // Side column is optional - if not provided, it will be inferred from quantity sign
      if (!symbol_column || !quantity_column || !entry_price_column) {
        return res.status(400).json({
          success: false,
          error: 'At minimum, symbol, quantity, and entry price columns must be mapped'
        });
      }

      const mappingId = uuidv4();
      const query = `
        INSERT INTO custom_csv_mappings (
          id, user_id, mapping_name, description,
          symbol_column, side_column, quantity_column,
          entry_price_column, exit_price_column,
          entry_date_column, exit_date_column,
          pnl_column, fees_column, notes_column,
          stop_loss_column, take_profit_column,
          date_format, delimiter, has_header_row, parsing_options
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING *
      `;

      const result = await db.query(query, [
        mappingId,
        userId,
        mapping_name.trim(),
        description || null,
        symbol_column,
        side_column,
        quantity_column,
        entry_price_column,
        exit_price_column || null,
        entry_date_column || null,
        exit_date_column || null,
        pnl_column || null,
        fees_column || null,
        notes_column || null,
        stop_loss_column || null,
        take_profit_column || null,
        date_format || 'MM/DD/YYYY',
        delimiter || ',',
        has_header_row !== undefined ? has_header_row : true,
        parsing_options || {}
      ]);

      logger.info(`CSV mapping created: ${mapping_name} for user ${userId}`);

      res.status(201).json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.logError('Error creating CSV mapping:', error);
      next(error);
    }
  },

  // Update an existing CSV mapping
  async updateMapping(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const {
        mapping_name,
        description,
        symbol_column,
        side_column,
        quantity_column,
        entry_price_column,
        exit_price_column,
        entry_date_column,
        exit_date_column,
        pnl_column,
        fees_column,
        notes_column,
        stop_loss_column,
        take_profit_column,
        date_format,
        delimiter,
        has_header_row,
        parsing_options
      } = req.body;

      // Check if mapping exists
      const existsQuery = 'SELECT id FROM custom_csv_mappings WHERE id = $1 AND user_id = $2';
      const existsResult = await db.query(existsQuery, [id, userId]);

      if (existsResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'CSV mapping not found'
        });
      }

      // Check for duplicate name (excluding current mapping)
      if (mapping_name) {
        const duplicateCheck = await db.query(
          'SELECT id FROM custom_csv_mappings WHERE user_id = $1 AND mapping_name = $2 AND id != $3',
          [userId, mapping_name.trim(), id]
        );

        if (duplicateCheck.rows.length > 0) {
          return res.status(400).json({
            success: false,
            error: 'A mapping with this name already exists'
          });
        }
      }

      const updateQuery = `
        UPDATE custom_csv_mappings
        SET
          mapping_name = COALESCE($1, mapping_name),
          description = COALESCE($2, description),
          symbol_column = COALESCE($3, symbol_column),
          side_column = COALESCE($4, side_column),
          quantity_column = COALESCE($5, quantity_column),
          entry_price_column = COALESCE($6, entry_price_column),
          exit_price_column = COALESCE($7, exit_price_column),
          entry_date_column = COALESCE($8, entry_date_column),
          exit_date_column = COALESCE($9, exit_date_column),
          pnl_column = COALESCE($10, pnl_column),
          fees_column = COALESCE($11, fees_column),
          notes_column = COALESCE($12, notes_column),
          stop_loss_column = COALESCE($13, stop_loss_column),
          take_profit_column = COALESCE($14, take_profit_column),
          date_format = COALESCE($15, date_format),
          delimiter = COALESCE($16, delimiter),
          has_header_row = COALESCE($17, has_header_row),
          parsing_options = COALESCE($18, parsing_options),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $19 AND user_id = $20
        RETURNING *
      `;

      const result = await db.query(updateQuery, [
        mapping_name?.trim(),
        description,
        symbol_column,
        side_column,
        quantity_column,
        entry_price_column,
        exit_price_column,
        entry_date_column,
        exit_date_column,
        pnl_column,
        fees_column,
        notes_column,
        stop_loss_column,
        take_profit_column,
        date_format,
        delimiter,
        has_header_row,
        parsing_options,
        id,
        userId
      ]);

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.logError('Error updating CSV mapping:', error);
      next(error);
    }
  },

  // Delete a CSV mapping
  async deleteMapping(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const query = 'DELETE FROM custom_csv_mappings WHERE id = $1 AND user_id = $2 RETURNING id';
      const result = await db.query(query, [id, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'CSV mapping not found'
        });
      }

      res.json({
        success: true,
        message: 'CSV mapping deleted successfully'
      });
    } catch (error) {
      logger.logError('Error deleting CSV mapping:', error);
      next(error);
    }
  },

  // Update last used timestamp and increment use count
  async recordMappingUsage(req, res, next) {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const query = `
        UPDATE custom_csv_mappings
        SET
          last_used_at = CURRENT_TIMESTAMP,
          use_count = use_count + 1
        WHERE id = $1 AND user_id = $2
        RETURNING id, use_count
      `;

      const result = await db.query(query, [id, userId]);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'CSV mapping not found'
        });
      }

      res.json({
        success: true,
        data: result.rows[0]
      });
    } catch (error) {
      logger.logError('Error recording CSV mapping usage:', error);
      next(error);
    }
  }
};

module.exports = csvMappingController;
