const pool = require('../config/database');

/**
 * Get all tags for the authenticated user
 */
const getAllTags = async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT id, name, color, created_at as "createdAt"
       FROM tags
       WHERE user_id = $1
       ORDER BY name ASC`,
      [userId]
    );

    res.json({
      success: true,
      tags: result.rows
    });
  } catch (error) {
    console.error('[ERROR] Error fetching tags:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tags'
    });
  }
};

/**
 * Create a new tag
 */
const createTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, color = '#3B82F6' } = req.body;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Tag name is required'
      });
    }

    if (name.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Tag name must be 50 characters or less'
      });
    }

    // Validate color format (hex color)
    const colorRegex = /^#[0-9A-Fa-f]{6}$/;
    if (color && !colorRegex.test(color)) {
      return res.status(400).json({
        success: false,
        message: 'Color must be a valid hex color (e.g., #3B82F6)'
      });
    }

    // Check if tag already exists for this user
    const existingTag = await pool.query(
      'SELECT id FROM tags WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
      [userId, name.trim()]
    );

    if (existingTag.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'A tag with this name already exists'
      });
    }

    // Create the tag
    const result = await pool.query(
      `INSERT INTO tags (user_id, name, color)
       VALUES ($1, $2, $3)
       RETURNING id, name, color, created_at as "createdAt"`,
      [userId, name.trim(), color]
    );

    console.log(`[SUCCESS] Tag created: ${name} for user ${userId}`);

    res.status(201).json({
      success: true,
      tag: result.rows[0]
    });
  } catch (error) {
    console.error('[ERROR] Error creating tag:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create tag'
    });
  }
};

/**
 * Update a tag
 */
const updateTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, color } = req.body;

    // Validation
    if (!name && !color) {
      return res.status(400).json({
        success: false,
        message: 'At least one field (name or color) must be provided'
      });
    }

    if (name && name.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Tag name must be 50 characters or less'
      });
    }

    // Validate color format if provided
    if (color) {
      const colorRegex = /^#[0-9A-Fa-f]{6}$/;
      if (!colorRegex.test(color)) {
        return res.status(400).json({
          success: false,
          message: 'Color must be a valid hex color (e.g., #3B82F6)'
        });
      }
    }

    // Check if tag exists and belongs to user
    const existingTag = await pool.query(
      'SELECT id FROM tags WHERE id = $1 AND user_id = $2',
      [id, userId]
    );

    if (existingTag.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Tag not found'
      });
    }

    // Check for duplicate name if name is being updated
    if (name) {
      const duplicateCheck = await pool.query(
        'SELECT id FROM tags WHERE user_id = $1 AND LOWER(name) = LOWER($2) AND id != $3',
        [userId, name.trim(), id]
      );

      if (duplicateCheck.rows.length > 0) {
        return res.status(409).json({
          success: false,
          message: 'A tag with this name already exists'
        });
      }
    }

    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name) {
      updates.push(`name = $${paramCount++}`);
      values.push(name.trim());
    }

    if (color) {
      updates.push(`color = $${paramCount++}`);
      values.push(color);
    }

    values.push(id, userId);

    const result = await pool.query(
      `UPDATE tags
       SET ${updates.join(', ')}
       WHERE id = $${paramCount++} AND user_id = $${paramCount}
       RETURNING id, name, color, created_at as "createdAt"`,
      values
    );

    console.log(`[SUCCESS] Tag updated: ${id} for user ${userId}`);

    res.json({
      success: true,
      tag: result.rows[0]
    });
  } catch (error) {
    console.error('[ERROR] Error updating tag:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update tag'
    });
  }
};

/**
 * Delete a tag
 */
const deleteTag = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if tag exists and belongs to user
      const existingTag = await client.query(
        'SELECT id, name FROM tags WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      if (existingTag.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'Tag not found'
        });
      }

      const tagName = existingTag.rows[0].name;

      // Remove tag from all trades that have it
      await client.query(
        `UPDATE trades
         SET tags = array_remove(tags, $1)
         WHERE user_id = $2 AND $1 = ANY(tags)`,
        [tagName, userId]
      );

      // Delete the tag
      await client.query(
        'DELETE FROM tags WHERE id = $1 AND user_id = $2',
        [id, userId]
      );

      await client.query('COMMIT');

      console.log(`[SUCCESS] Tag deleted: ${tagName} (${id}) for user ${userId}`);

      res.json({
        success: true,
        message: 'Tag deleted successfully'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[ERROR] Error deleting tag:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete tag'
    });
  }
};

module.exports = {
  getAllTags,
  createTag,
  updateTag,
  deleteTag
};
