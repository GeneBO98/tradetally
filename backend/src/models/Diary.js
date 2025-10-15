const db = require('../config/database');
const { getUserLocalDate } = require('../utils/timezone');

class Diary {
  static async create(userId, entryData) {
    const {
      entryDate, title, content, tags, entryType = 'diary',
      marketBias, keyLevels, watchlist, linkedTrades, followedPlan, lessonsLearned
    } = entryData;

    // Use provided date or today's date in user's timezone
    const finalEntryDate = entryDate || await getUserLocalDate(userId);

    const query = `
      INSERT INTO diary_entries (
        user_id, entry_date, title, content, tags, entry_type,
        market_bias, key_levels, watchlist, linked_trades, followed_plan, lessons_learned
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (user_id, entry_date, entry_type)
      DO UPDATE SET
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        tags = EXCLUDED.tags,
        market_bias = EXCLUDED.market_bias,
        key_levels = EXCLUDED.key_levels,
        watchlist = EXCLUDED.watchlist,
        linked_trades = EXCLUDED.linked_trades,
        followed_plan = EXCLUDED.followed_plan,
        lessons_learned = EXCLUDED.lessons_learned,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const values = [
      userId,
      finalEntryDate,
      title || null,
      content || null,
      tags || [],
      entryType,
      marketBias || null,
      keyLevels || null,
      watchlist || [],
      linkedTrades || [],
      followedPlan || null,
      lessonsLearned || null
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async findById(id, userId = null) {
    let query = `
      SELECT de.*, 
        json_agg(
          json_build_object(
            'id', da.id,
            'file_url', da.file_url,
            'file_type', da.file_type,
            'file_name', da.file_name,
            'file_size', da.file_size,
            'uploaded_at', da.uploaded_at
          )
        ) FILTER (WHERE da.id IS NOT NULL) as attachments
      FROM diary_entries de
      LEFT JOIN diary_attachments da ON de.id = da.diary_entry_id
      WHERE de.id = $1
    `;

    const values = [id];

    if (userId) {
      query += ` AND de.user_id = $2`;
      values.push(userId);
    }

    query += ` GROUP BY de.id`;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  }

  static async findByUser(userId, filters = {}) {
    const {
      limit = 50, offset = 0, entryType, startDate, endDate,
      tags, marketBias, search
    } = filters;

    let query = `
      SELECT de.*,
        json_agg(
          json_build_object(
            'id', da.id,
            'file_url', da.file_url,
            'file_type', da.file_type,
            'file_name', da.file_name,
            'file_size', da.file_size,
            'uploaded_at', da.uploaded_at
          )
        ) FILTER (WHERE da.id IS NOT NULL) as attachments,
        COUNT(*) OVER() as total_count
      FROM diary_entries de
      LEFT JOIN diary_attachments da ON de.id = da.diary_entry_id
      WHERE de.user_id = $1
    `;

    const values = [userId];
    let paramCount = 2;

    // Add filters
    if (entryType) {
      query += ` AND de.entry_type = $${paramCount}`;
      values.push(entryType);
      paramCount++;
    }

    if (startDate) {
      query += ` AND de.entry_date >= $${paramCount}`;
      values.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND de.entry_date <= $${paramCount}`;
      values.push(endDate);
      paramCount++;
    }

    if (marketBias) {
      query += ` AND de.market_bias = $${paramCount}`;
      values.push(marketBias);
      paramCount++;
    }

    if (tags && tags.length > 0) {
      query += ` AND de.tags && $${paramCount}`;
      values.push(tags);
      paramCount++;
    }

    if (search) {
      // Check if searching for a tag (starts with #)
      if (search.startsWith('#')) {
        const tag = search.substring(1); // Remove the # symbol
        query += ` AND $${paramCount} = ANY(de.tags)`;
        values.push(tag);
      } else {
        // Search in text fields and also check if any tag contains the search term
        query += ` AND (
          de.title ILIKE $${paramCount}
          OR de.content ILIKE $${paramCount}
          OR de.key_levels ILIKE $${paramCount}
          OR de.lessons_learned ILIKE $${paramCount}
          OR EXISTS (
            SELECT 1 FROM unnest(de.tags) AS tag
            WHERE tag ILIKE $${paramCount}
          )
        )`;
        values.push(`%${search}%`);
      }
      paramCount++;
    }

    query += `
      GROUP BY de.id
      ORDER BY de.entry_date DESC, de.created_at DESC
      LIMIT $${paramCount} OFFSET $${paramCount + 1}
    `;

    values.push(limit, offset);

    const result = await db.query(query, values);
    return {
      entries: result.rows,
      total: result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0
    };
  }

  static async findByDate(userId, date, entryType = 'diary') {
    const query = `
      SELECT de.*,
        json_agg(
          json_build_object(
            'id', da.id,
            'file_url', da.file_url,
            'file_type', da.file_type,
            'file_name', da.file_name,
            'file_size', da.file_size,
            'uploaded_at', da.uploaded_at
          )
        ) FILTER (WHERE da.id IS NOT NULL) as attachments
      FROM diary_entries de
      LEFT JOIN diary_attachments da ON de.id = da.diary_entry_id
      WHERE de.user_id = $1 AND DATE(de.entry_date) = $2 AND de.entry_type = $3
      GROUP BY de.id
    `;

    const result = await db.query(query, [userId, date, entryType]);
    return result.rows[0] || null;
  }

  static async findTodaysEntry(userId) {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    return this.findByDate(userId, today, 'diary');
  }

  static async findByDateRange(userId, startDate, endDate) {
    const query = `
      SELECT de.*,
        json_agg(
          json_build_object(
            'id', da.id,
            'file_url', da.file_url,
            'file_type', da.file_type,
            'file_name', da.file_name,
            'file_size', da.file_size,
            'uploaded_at', da.uploaded_at
          )
        ) FILTER (WHERE da.id IS NOT NULL) as attachments
      FROM diary_entries de
      LEFT JOIN diary_attachments da ON de.id = da.diary_entry_id
      WHERE de.user_id = $1 
        AND DATE(de.entry_date) >= $2 
        AND DATE(de.entry_date) <= $3
      GROUP BY de.id
      ORDER BY de.entry_date ASC
    `;

    const result = await db.query(query, [userId, startDate, endDate]);
    return result.rows;
  }

  static async update(id, userId, updates) {
    // Map camelCase to snake_case
    const fieldMapping = {
      entryType: 'entry_type',
      marketBias: 'market_bias',
      keyLevels: 'key_levels',
      linkedTrades: 'linked_trades',
      followedPlan: 'followed_plan',
      lessonsLearned: 'lessons_learned'
    };

    const allowedFields = [
      'title', 'content', 'tags', 'entry_type', 'market_bias',
      'key_levels', 'watchlist', 'linked_trades', 'followed_plan', 'lessons_learned'
    ];

    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(field => {
      // Convert camelCase to snake_case if mapping exists
      const dbField = fieldMapping[field] || field;

      if (allowedFields.includes(dbField) && updates[field] !== undefined) {
        fields.push(`${dbField} = $${paramCount}`);
        values.push(updates[field]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(id, userId);

    const query = `
      UPDATE diary_entries
      SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  }

  static async delete(id, userId) {
    // Delete attachments first (CASCADE will handle this, but we want to clean up files)
    const attachmentsQuery = `
      SELECT file_url FROM diary_attachments da
      JOIN diary_entries de ON da.diary_entry_id = de.id
      WHERE de.id = $1 AND de.user_id = $2
    `;
    const attachments = await db.query(attachmentsQuery, [id, userId]);

    // Delete the entry (CASCADE will delete attachments)
    const query = `
      DELETE FROM diary_entries
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;

    const result = await db.query(query, [id, userId]);
    
    if (result.rows.length > 0) {
      // TODO: Clean up attachment files from filesystem
      // This would be implemented with the file system cleanup
      return result.rows[0];
    }
    
    return null;
  }

  static async addAttachment(entryId, attachmentData, userId = null) {
    // Verify entry belongs to user if userId provided
    if (userId) {
      const entry = await this.findById(entryId, userId);
      if (!entry) {
        throw new Error('Diary entry not found or access denied');
      }
    }

    const query = `
      INSERT INTO diary_attachments (
        diary_entry_id, file_url, file_type, file_name, file_size
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      entryId,
      attachmentData.fileUrl,
      attachmentData.fileType,
      attachmentData.fileName,
      attachmentData.fileSize
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async deleteAttachment(attachmentId, userId) {
    // Get attachment info and verify ownership
    const selectQuery = `
      SELECT da.*, de.user_id 
      FROM diary_attachments da
      JOIN diary_entries de ON da.diary_entry_id = de.id
      WHERE da.id = $1 AND de.user_id = $2
    `;

    const selectResult = await db.query(selectQuery, [attachmentId, userId]);
    
    if (selectResult.rows.length === 0) {
      return null;
    }

    const attachment = selectResult.rows[0];

    // Delete the attachment
    const deleteQuery = `DELETE FROM diary_attachments WHERE id = $1`;
    await db.query(deleteQuery, [attachmentId]);

    // TODO: Clean up file from filesystem
    return attachment;
  }

  static async getTagsList(userId) {
    const query = `
      SELECT DISTINCT unnest(tags) as tag
      FROM diary_entries
      WHERE user_id = $1 AND tags IS NOT NULL AND array_length(tags, 1) > 0
      ORDER BY tag
    `;

    const result = await db.query(query, [userId]);
    return result.rows.map(row => row.tag);
  }

  static async getStats(userId, filters = {}) {
    const { startDate, endDate, entryType } = filters;

    let query = `
      SELECT 
        COUNT(*) as total_entries,
        COUNT(CASE WHEN market_bias = 'bullish' THEN 1 END) as bullish_days,
        COUNT(CASE WHEN market_bias = 'bearish' THEN 1 END) as bearish_days,
        COUNT(CASE WHEN market_bias = 'neutral' THEN 1 END) as neutral_days,
        COUNT(CASE WHEN followed_plan = true THEN 1 END) as plan_followed,
        COUNT(CASE WHEN followed_plan = false THEN 1 END) as plan_not_followed
      FROM diary_entries
      WHERE user_id = $1
    `;

    const values = [userId];
    let paramCount = 2;

    if (entryType) {
      query += ` AND entry_type = $${paramCount}`;
      values.push(entryType);
      paramCount++;
    }

    if (startDate) {
      query += ` AND entry_date >= $${paramCount}`;
      values.push(startDate);
      paramCount++;
    }

    if (endDate) {
      query += ` AND entry_date <= $${paramCount}`;
      values.push(endDate);
      paramCount++;
    }

    const result = await db.query(query, values);
    const stats = result.rows[0];

    // Convert string numbers to integers
    Object.keys(stats).forEach(key => {
      stats[key] = parseInt(stats[key]) || 0;
    });

    return stats;
  }
}

module.exports = Diary;