const db = require('../config/database');
const logger = require('../utils/logger');

class DiaryTemplate {
  /**
   * Create a new diary template
   */
  static async create(userId, templateData) {
    const {
      name, description, entryType = 'diary',
      title, content, marketBias, keyLevels, watchlist, tags,
      followedPlan, lessonsLearned,
      isDefault = false
    } = templateData;

    // If setting as default, unset any existing default templates for this entry type
    if (isDefault) {
      await this.unsetDefaultTemplates(userId, entryType);
    }

    const query = `
      INSERT INTO diary_templates (
        user_id, name, description, entry_type,
        title, content, market_bias, key_levels, watchlist, tags,
        followed_plan, lessons_learned,
        is_default
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;

    const values = [
      userId,
      name,
      description || null,
      entryType,
      title || null,
      content || null,
      marketBias || null,
      keyLevels || null,
      watchlist || [],
      tags || [],
      followedPlan !== undefined ? followedPlan : null,
      lessonsLearned || null,
      isDefault
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  /**
   * Find template by ID
   */
  static async findById(id, userId) {
    const query = `
      SELECT * FROM diary_templates
      WHERE id = $1 AND user_id = $2
    `;

    const result = await db.query(query, [id, userId]);
    return result.rows[0] || null;
  }

  /**
   * Find all templates for a user
   */
  static async findByUser(userId, filters = {}) {
    const { entryType, limit = 50, offset = 0 } = filters;

    let query = `
      SELECT * FROM diary_templates
      WHERE user_id = $1
    `;

    const values = [userId];
    let paramCount = 2;

    if (entryType) {
      query += ` AND entry_type = $${paramCount}`;
      values.push(entryType);
      paramCount++;
    }

    query += ` ORDER BY is_default DESC, use_count DESC, name ASC`;
    query += ` LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    values.push(limit, offset);

    const result = await db.query(query, values);

    // Get total count
    let countQuery = `SELECT COUNT(*) FROM diary_templates WHERE user_id = $1`;
    const countValues = [userId];

    if (entryType) {
      countQuery += ` AND entry_type = $2`;
      countValues.push(entryType);
    }

    const countResult = await db.query(countQuery, countValues);
    const total = parseInt(countResult.rows[0].count);

    return {
      templates: result.rows,
      total
    };
  }

  /**
   * Get default template for user and entry type
   */
  static async getDefaultTemplate(userId, entryType = 'diary') {
    const query = `
      SELECT * FROM diary_templates
      WHERE user_id = $1 AND entry_type = $2 AND is_default = true
      LIMIT 1
    `;

    const result = await db.query(query, [userId, entryType]);
    return result.rows[0] || null;
  }

  /**
   * Update a template
   */
  static async update(id, userId, updates) {
    const allowedFields = [
      'name', 'description', 'entryType', 'title', 'content',
      'marketBias', 'keyLevels', 'watchlist', 'tags',
      'followedPlan', 'lessonsLearned', 'isDefault'
    ];

    const setters = [];
    const values = [];
    let paramCount = 1;

    // Build dynamic update query
    for (const [key, value] of Object.entries(updates)) {
      if (!allowedFields.includes(key)) continue;

      // Convert camelCase to snake_case for database
      const dbField = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

      setters.push(`${dbField} = $${paramCount}`);
      values.push(value);
      paramCount++;
    }

    if (setters.length === 0) {
      throw new Error('No valid fields to update');
    }

    // If setting as default, unset other defaults first
    if (updates.isDefault === true) {
      // If entryType is not provided in updates, fetch the current template to get its entry_type
      let entryType = updates.entryType;
      if (!entryType) {
        logger.debug(`[TEMPLATE] Fetching current template to determine entry_type for template ${id}`, 'app');
        const currentTemplate = await this.findById(id, userId);
        if (!currentTemplate) {
          logger.error(`[TEMPLATE] Template ${id} not found when trying to set as default`, null, 'error');
          throw new Error('Template not found');
        }
        entryType = currentTemplate.entry_type;
        logger.debug(`[TEMPLATE] Using existing entry_type: ${entryType}`, 'app');
      }
      logger.debug(`[TEMPLATE] Unsetting other default templates for user ${userId}, entryType ${entryType}`, 'app');
      await this.unsetDefaultTemplates(userId, entryType, id);
    }

    values.push(id, userId);
    const query = `
      UPDATE diary_templates
      SET ${setters.join(', ')}
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING *
    `;

    logger.debug(`[TEMPLATE] Executing update query with ${values.length} parameters`, 'app');
    const result = await db.query(query, values);

    if (!result.rows[0]) {
      logger.warn(`[TEMPLATE] Update query returned no rows for template ${id}`, 'app');
    }

    return result.rows[0] || null;
  }

  /**
   * Delete a template
   */
  static async delete(id, userId) {
    const query = `
      DELETE FROM diary_templates
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await db.query(query, [id, userId]);
    return result.rows[0] || null;
  }

  /**
   * Increment use count when template is applied
   */
  static async incrementUseCount(id, userId) {
    const query = `
      UPDATE diary_templates
      SET use_count = use_count + 1
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await db.query(query, [id, userId]);
    return result.rows[0] || null;
  }

  /**
   * Unset default templates for a user and entry type
   */
  static async unsetDefaultTemplates(userId, entryType, excludeId = null) {
    let query = `
      UPDATE diary_templates
      SET is_default = false
      WHERE user_id = $1 AND entry_type = $2 AND is_default = true
    `;

    const values = [userId, entryType];

    if (excludeId) {
      query += ` AND id != $3`;
      values.push(excludeId);
    }

    await db.query(query, values);
  }

  /**
   * Duplicate an existing template
   */
  static async duplicate(id, userId, newName) {
    const template = await this.findById(id, userId);

    if (!template) {
      throw new Error('Template not found');
    }

    const duplicateData = {
      name: newName || `${template.name} (Copy)`,
      description: template.description,
      entryType: template.entry_type,
      title: template.title,
      content: template.content,
      marketBias: template.market_bias,
      keyLevels: template.key_levels,
      watchlist: template.watchlist,
      tags: template.tags,
      followedPlan: template.followed_plan,
      lessonsLearned: template.lessons_learned,
      isDefault: false // Don't copy default status
    };

    return await this.create(userId, duplicateData);
  }
}

module.exports = DiaryTemplate;
