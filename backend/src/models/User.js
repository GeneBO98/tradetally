const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create({ email, username, password, fullName, verificationToken, verificationExpires, role = 'user', isVerified = false, adminApproved = true }) {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const query = `
      INSERT INTO users (email, username, password_hash, full_name, verification_token, verification_expires, role, is_verified, admin_approved)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, created_at
    `;
    
    const values = [email.toLowerCase(), username, hashedPassword, fullName, verificationToken, verificationExpires, role, isVerified, adminApproved];
    const result = await db.query(query, values);
    
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, 
             two_factor_enabled, created_at, updated_at
      FROM users
      WHERE id = $1 AND is_active = true
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByIdForAdmin(id) {
    const query = `
      SELECT id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, 
             two_factor_enabled, created_at, updated_at
      FROM users
      WHERE id = $1
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByEmail(email) {
    const query = `
      SELECT id, email, username, password_hash, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, 
             two_factor_enabled, two_factor_secret, created_at
      FROM users
      WHERE email = $1
    `;
    
    const result = await db.query(query, [email.toLowerCase()]);
    return result.rows[0];
  }

  static async findByUsername(username) {
    const query = `
      SELECT id, email, username, full_name, avatar_url, is_verified, admin_approved, is_active, timezone, created_at
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
      RETURNING id, email, username, full_name, avatar_url, is_verified, admin_approved, is_active, timezone, updated_at
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
      theme: 'theme',
      tradingStrategies: 'trading_strategies',
      tradingStyles: 'trading_styles',
      riskTolerance: 'risk_tolerance',
      primaryMarkets: 'primary_markets',
      experienceLevel: 'experience_level',
      averagePositionSize: 'average_position_size',
      tradingGoals: 'trading_goals',
      preferredSectors: 'preferred_sectors'
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


  static async updateResetToken(userId, resetToken, resetExpires) {
    const query = `
      UPDATE users 
      SET reset_token = $1, reset_expires = $2
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [resetToken, resetExpires, userId]);
    return result.rows[0];
  }

  static async findByResetToken(token) {
    const query = `
      SELECT * FROM users 
      WHERE reset_token = $1 AND reset_expires > NOW()
    `;
    
    const result = await db.query(query, [token]);
    return result.rows[0];
  }

  static async updatePassword(userId, hashedPassword) {
    const query = `
      UPDATE users 
      SET password_hash = $1, reset_token = NULL, reset_expires = NULL
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [hashedPassword, userId]);
    return result.rows[0];
  }

  static async getUserCount() {
    const query = `SELECT COUNT(*) as count FROM users WHERE is_active = true`;
    const result = await db.query(query);
    return parseInt(result.rows[0].count);
  }

  // Admin user management methods
  static async getAllUsers() {
    const query = `
      SELECT id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  static async updateRole(userId, role) {
    const query = `
      UPDATE users
      SET role = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, email, username, full_name, avatar_url, role, is_verified, is_active, timezone, created_at, updated_at
    `;
    
    const result = await db.query(query, [role, userId]);
    return result.rows[0];
  }

  static async updateStatus(userId, isActive) {
    const query = `
      UPDATE users
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, email, username, full_name, avatar_url, role, is_verified, is_active, timezone, created_at, updated_at
    `;
    
    const result = await db.query(query, [isActive, userId]);
    return result.rows[0];
  }

  static async getAdminCount() {
    const query = `SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = true`;
    const result = await db.query(query);
    return parseInt(result.rows[0].count);
  }

  static async getActiveAdminCount() {
    const query = `SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND is_active = true`;
    const result = await db.query(query);
    return parseInt(result.rows[0].count);
  }

  static async getOwnerCount() {
    const query = `SELECT COUNT(*) as count FROM users WHERE role = 'owner'`;
    const result = await db.query(query);
    return parseInt(result.rows[0].count);
  }

  static async getOwner() {
    const query = `SELECT id, email, username, full_name, avatar_url, role, is_verified, is_active, timezone, created_at, updated_at FROM users WHERE role = 'owner' LIMIT 1`;
    const result = await db.query(query);
    return result.rows[0];
  }

  static async deleteUser(userId) {
    // Start a transaction to ensure all deletions succeed or fail together
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete related data that doesn't have CASCADE constraints
      // Delete CUSIP mappings for this user
      await client.query('DELETE FROM cusip_mappings WHERE user_id = $1', [userId]);
      
      // Delete user settings
      await client.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);
      
      // Delete API keys
      await client.query('DELETE FROM api_keys WHERE user_id = $1', [userId]);
      
      // Delete trades (if you want to delete them - otherwise comment this out)
      await client.query('DELETE FROM trades WHERE user_id = $1', [userId]);
      
      // Delete job queue entries for this user's trades
      await client.query(`
        DELETE FROM job_queue 
        WHERE data->>'userId' = $1 
        OR data->>'tradeId' IN (SELECT id::text FROM trades WHERE user_id = $2)
      `, [userId, userId]);
      
      // Finally, delete the user
      // Other tables with ON DELETE CASCADE will be handled automatically
      const query = `DELETE FROM users WHERE id = $1`;
      const result = await client.query(query, [userId]);
      
      await client.query('COMMIT');
      
      return result.rowCount > 0;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async approveUser(userId) {
    const query = `
      UPDATE users
      SET admin_approved = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, created_at, updated_at
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  static async getPendingUsers() {
    const query = `
      SELECT id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, created_at, updated_at
      FROM users
      WHERE admin_approved = false AND is_active = true
      ORDER BY created_at ASC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  static async updateBackupCodes(userId, backupCodes) {
    const query = `
      UPDATE users
      SET two_factor_backup_codes = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id
    `;
    
    const result = await db.query(query, [backupCodes, userId]);
    return result.rows[0];
  }
}

module.exports = User;