const db = require('../config/database');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

class ApiKey {
  static async create({ userId, name, permissions = ['read'], expiresAt = null }) {
    // Generate a random API key
    const key = this.generateApiKey();
    const keyPrefix = key.substring(0, 8);
    const keyHash = await bcrypt.hash(key, 10);

    const query = `
      INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, expires_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, key_prefix, permissions, expires_at, is_active, created_at
    `;

    const result = await db.query(query, [
      userId,
      name,
      keyHash,
      keyPrefix,
      JSON.stringify(permissions),
      expiresAt
    ]);

    const row = result.rows[0];
    return {
      ...row,
      key: key, // Return the plain key only once when creating
      permissions: typeof row.permissions === 'string' ? typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions : row.permissions
    };
  }

  static async findById(id) {
    const query = `
      SELECT id, user_id, name, key_prefix, permissions, last_used_at, 
             expires_at, is_active, created_at, updated_at
      FROM api_keys 
      WHERE id = $1
    `;
    
    const result = await db.query(query, [id]);
    if (result.rows.length === 0) return null;
    
    return {
      ...result.rows[0],
      permissions: typeof result.rows[0].permissions === 'string' ? JSON.parse(result.rows[0].permissions) : result.rows[0].permissions
    };
  }

  static async findByKeyHash(keyHash) {
    const query = `
      SELECT ak.*, u.username, u.email, u.role
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key_hash = $1 AND ak.is_active = true
      AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
    `;
    
    const result = await db.query(query, [keyHash]);
    if (result.rows.length === 0) return null;
    
    return {
      ...result.rows[0],
      permissions: typeof result.rows[0].permissions === 'string' ? JSON.parse(result.rows[0].permissions) : result.rows[0].permissions
    };
  }

  static async findByUserId(userId) {
    const query = `
      SELECT id, name, key_prefix, permissions, last_used_at, 
             expires_at, is_active, created_at, updated_at
      FROM api_keys 
      WHERE user_id = $1
      ORDER BY created_at DESC
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows.map(row => ({
      ...row,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions
    }));
  }

  static async updateLastUsed(id) {
    const query = `
      UPDATE api_keys 
      SET last_used_at = NOW()
      WHERE id = $1
    `;
    
    await db.query(query, [id]);
  }

  static async update(id, { name, permissions, expiresAt, isActive }) {
    const updates = [];
    const values = [];
    let paramCount = 0;

    if (name !== undefined) {
      updates.push(`name = $${++paramCount}`);
      values.push(name);
    }
    if (permissions !== undefined) {
      updates.push(`permissions = $${++paramCount}`);
      values.push(JSON.stringify(permissions));
    }
    if (expiresAt !== undefined) {
      updates.push(`expires_at = $${++paramCount}`);
      values.push(expiresAt);
    }
    if (isActive !== undefined) {
      updates.push(`is_active = $${++paramCount}`);
      values.push(isActive);
    }

    if (updates.length === 0) return null;

    const query = `
      UPDATE api_keys 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${++paramCount}
      RETURNING id, name, key_prefix, permissions, last_used_at, 
               expires_at, is_active, created_at, updated_at
    `;
    values.push(id);

    const result = await db.query(query, values);
    if (result.rows.length === 0) return null;
    
    return {
      ...result.rows[0],
      permissions: typeof result.rows[0].permissions === 'string' ? JSON.parse(result.rows[0].permissions) : result.rows[0].permissions
    };
  }

  static async delete(id) {
    const query = 'DELETE FROM api_keys WHERE id = $1 RETURNING id';
    const result = await db.query(query, [id]);
    return result.rows.length > 0;
  }

  static async verifyKey(key) {
    // Extract potential key prefix to optimize search
    const keyPrefix = key.substring(0, 8);
    
    const query = `
      SELECT ak.*, u.username, u.email, u.role
      FROM api_keys ak
      JOIN users u ON ak.user_id = u.id
      WHERE ak.key_prefix = $1 AND ak.is_active = true
      AND (ak.expires_at IS NULL OR ak.expires_at > NOW())
    `;
    
    const result = await db.query(query, [keyPrefix]);
    
    for (const row of result.rows) {
      const isValid = await bcrypt.compare(key, row.key_hash);
      if (isValid) {
        // Update last used timestamp
        await this.updateLastUsed(row.id);
        
        return {
          ...row,
          permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions
        };
      }
    }
    
    return null;
  }

  static generateApiKey() {
    // Generate a secure random API key
    // Format: tt_live_[32 chars] or tt_test_[32 chars]
    const randomBytes = crypto.randomBytes(24);
    const randomString = randomBytes.toString('base64url'); // URL-safe base64
    return `tt_live_${randomString}`;
  }

  static async cleanupExpired() {
    const query = `
      UPDATE api_keys 
      SET is_active = false 
      WHERE expires_at <= NOW() AND is_active = true
      RETURNING id, name, user_id
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
}

module.exports = ApiKey;