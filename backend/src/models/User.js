const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create({ email, username, password, fullName }) {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const query = `
      INSERT INTO users (email, username, password_hash, full_name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, email, username, full_name, avatar_url, is_verified, is_active, timezone, created_at
    `;
    
    const values = [email.toLowerCase(), username, hashedPassword, fullName];
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

    Object.entries(settings).forEach(([key, value]) => {
      if (key !== 'user_id' && key !== 'id') {
        fields.push(`${key} = $${paramCount}`);
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
}

module.exports = User;