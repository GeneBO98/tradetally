const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create({ email, username, password, fullName, verificationToken, verificationExpires }) {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const query = `
      INSERT INTO users (email, username, password_hash, full_name, verification_token, verification_expires)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, username, full_name, avatar_url, is_verified, is_active, timezone, created_at
    `;
    
    const values = [email.toLowerCase(), username, hashedPassword, fullName, verificationToken, verificationExpires];
    const result = await db.query(query, values);
    
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT id, email, username, full_name, avatar_url, is_verified, is_active, timezone, created_at, updated_at
      FROM users
      WHERE id = $1 AND is_active = true
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByEmail(email) {
    const query = `
      SELECT id, email, username, password_hash, full_name, avatar_url, is_verified, is_active, timezone, created_at
      FROM users
      WHERE email = $1
    `;
    
    const result = await db.query(query, [email.toLowerCase()]);
    return result.rows[0];
  }

  static async findByUsername(username) {
    const query = `
      SELECT id, email, username, full_name, avatar_url, is_verified, is_active, timezone, created_at
      FROM users
      WHERE username = $1 AND is_active = true
    `;
    
    const result = await db.query(query, [username]);
    return result.rows[0];
  }

  static async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.entries(updates).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'password') {
        fields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    if (updates.password) {
      const hashedPassword = await bcrypt.hash(updates.password, 10);
      fields.push(`password_hash = $${paramCount}`);
      values.push(hashedPassword);
      paramCount++;
    }

    values.push(id);

    const query = `
      UPDATE users
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, email, username, full_name, avatar_url, is_verified, is_active, timezone, updated_at
    `;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async verifyPassword(user, password) {
    return bcrypt.compare(password, user.password_hash);
  }

  static async createSettings(userId) {
    const query = `
      INSERT INTO user_settings (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING *
    `;
    
    const result = await db.query(query, [userId]);
    
    // If no row was returned due to conflict, fetch the existing settings
    if (result.rows.length === 0) {
      return await this.getSettings(userId);
    }
    
    return result.rows[0];
  }

  static async getSettings(userId) {
    const query = `
      SELECT * FROM user_settings
      WHERE user_id = $1
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  static async updateSettings(userId, settings) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    // Map camelCase to snake_case for database columns
    const columnMapping = {
      emailNotifications: 'email_notifications',
      publicProfile: 'public_profile',
      defaultTags: 'default_tags',
      importSettings: 'import_settings',
      theme: 'theme'
    };

    Object.entries(settings).forEach(([key, value]) => {
      if (key !== 'user_id' && key !== 'id') {
        const dbColumn = columnMapping[key] || key;
        fields.push(`${dbColumn} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    });

    values.push(userId);

    const query = `
      UPDATE user_settings
      SET ${fields.join(', ')}
      WHERE user_id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async findByVerificationToken(token) {
    const query = `
      SELECT id, email, username, verification_token, verification_expires, is_verified
      FROM users
      WHERE verification_token = $1 AND is_active = true
    `;
    
    const result = await db.query(query, [token]);
    return result.rows[0];
  }

  static async verifyUser(userId) {
    const query = `
      UPDATE users
      SET is_verified = true, verification_token = NULL, verification_expires = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email, username, is_verified
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  static async updateVerificationToken(userId, token, expires) {
    const query = `
      UPDATE users
      SET verification_token = $1, verification_expires = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, email
    `;
    
    const result = await db.query(query, [token, expires, userId]);
    return result.rows[0];
  }
}

module.exports = User;