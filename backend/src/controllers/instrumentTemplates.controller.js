const pool = require('../config/database');

/**
 * Get all instrument templates for the authenticated user
 */
const getAllTemplates = async (req, res) => {
  try {
    const userId = req.user.id;
    const { instrument_type } = req.query;

    let query = `
      SELECT id, name, instrument_type, symbol,
             underlying_symbol, option_type, contract_size,
             underlying_asset, tick_size, point_value,
             contract_month, contract_year,
             created_at, updated_at
      FROM instrument_templates
      WHERE user_id = $1
    `;
    const values = [userId];

    if (instrument_type) {
      query += ` AND instrument_type = $2`;
      values.push(instrument_type);
    }

    query += ` ORDER BY name ASC`;

    const result = await pool.query(query, values);

    res.json({
      success: true,
      templates: result.rows
    });
  } catch (error) {
    console.error('[ERROR] Error fetching instrument templates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch instrument templates'
    });
  }
};

/**
 * Get a single template by ID
 */
const getTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `SELECT id, name, instrument_type, symbol,
              underlying_symbol, option_type, contract_size,
              underlying_asset, tick_size, point_value,
              contract_month, contract_year,
              created_at, updated_at
       FROM instrument_templates
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    res.json({
      success: true,
      template: result.rows[0]
    });
  } catch (error) {
    console.error('[ERROR] Error fetching instrument template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch instrument template'
    });
  }
};

/**
 * Create a new instrument template
 */
const createTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      name,
      instrument_type,
      symbol,
      // Options fields
      underlying_symbol,
      option_type,
      contract_size,
      // Futures fields
      underlying_asset,
      tick_size,
      point_value,
      contract_month,
      contract_year
    } = req.body;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Template name is required'
      });
    }

    if (name.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Template name must be 100 characters or less'
      });
    }

    if (!instrument_type || !['future', 'option'].includes(instrument_type)) {
      return res.status(400).json({
        success: false,
        message: 'Valid instrument type (future or option) is required'
      });
    }

    // Check if template name already exists for this user
    const existingTemplate = await pool.query(
      'SELECT id FROM instrument_templates WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
      [userId, name.trim()]
    );

    if (existingTemplate.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A template with this name already exists'
      });
    }

    // Create the template
    const result = await pool.query(
      `INSERT INTO instrument_templates (
        user_id, name, instrument_type, symbol,
        underlying_symbol, option_type, contract_size,
        underlying_asset, tick_size, point_value,
        contract_month, contract_year
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id, name, instrument_type, symbol,
                underlying_symbol, option_type, contract_size,
                underlying_asset, tick_size, point_value,
                contract_month, contract_year,
                created_at, updated_at`,
      [
        userId,
        name.trim(),
        instrument_type,
        symbol || null,
        underlying_symbol || null,
        option_type || null,
        contract_size || null,
        underlying_asset || null,
        tick_size || null,
        point_value || null,
        contract_month || null,
        contract_year || null
      ]
    );

    console.log(`[SUCCESS] Instrument template created: ${name} for user ${userId}`);

    res.status(201).json({
      success: true,
      template: result.rows[0]
    });
  } catch (error) {
    console.error('[ERROR] Error creating instrument template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create instrument template'
    });
  }
};

/**
 * Update an instrument template
 */
const updateTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      name,
      symbol,
      underlying_symbol,
      option_type,
      contract_size,
      underlying_asset,
      tick_size,
      point_value,
      contract_month,
      contract_year
    } = req.body;

    // Check if template exists and belongs to user
    const existingTemplate = await pool.query(
      'SELECT id, instrument_type FROM instrument_templates WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingTemplate.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    // Check for duplicate name if name is being updated
    if (name) {
      if (name.length > 100) {
        return res.status(400).json({
          success: false,
          message: 'Template name must be 100 characters or less'
        });
      }

      const duplicateCheck = await pool.query(
        'SELECT id FROM instrument_templates WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND id != $3',
        [userId, name.trim(), id]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'A template with this name already exists'
        });
      }
    }

    // Update the template
    const result = await pool.query(
      `UPDATE instrument_templates
       SET name = COALESCE($1, name),
           symbol = $2,
           underlying_symbol = $3,
           option_type = $4,
           contract_size = $5,
           underlying_asset = $6,
           tick_size = $7,
           point_value = $8,
           contract_month = $9,
           contract_year = $10,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 AND user_id = $12
       RETURNING id, name, instrument_type, symbol,
                 underlying_symbol, option_type, contract_size,
                 underlying_asset, tick_size, point_value,
                 contract_month, contract_year,
                 created_at, updated_at`,
      [
        name ? name.trim() : null,
        symbol || null,
        underlying_symbol || null,
        option_type || null,
        contract_size || null,
        underlying_asset || null,
        tick_size || null,
        point_value || null,
        contract_month || null,
        contract_year || null,
        id,
        userId
      ]
    );

    console.log(`[SUCCESS] Instrument template updated: ${id} for user ${userId}`);

    res.json({
      success: true,
      template: result.rows[0]
    });
  } catch (error) {
    console.error('[ERROR] Error updating instrument template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update instrument template'
    });
  }
};

/**
 * Delete an instrument template
 */
const deleteTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    // Check if template exists and belongs to user
    const existingTemplate = await pool.query(
      'SELECT id, name FROM instrument_templates WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingTemplate.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    const templateName = existingTemplate.rows[0].name;

    // Delete the template
    await pool.query(
      'DELETE FROM instrument_templates WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    console.log(`[SUCCESS] Instrument template deleted: ${templateName} (${id}) for user ${userId}`);

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('[ERROR] Error deleting instrument template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete instrument template'
    });
  }
};

module.exports = {
  getAllTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate
};
