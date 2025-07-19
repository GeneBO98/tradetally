const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create({ email, username, password, fullName, verificationToken, verificationExpires, role = 'user', isVerified = false, adminApproved = true, tier = 'free' }) {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Admins get Pro tier by default
    if (role === 'admin' || role === 'owner') {
      tier = 'pro';
    }
    
    const query = `
      INSERT INTO users (email, username, password_hash, full_name, verification_token, verification_expires, role, is_verified, admin_approved, tier)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, tier, created_at
    `;
    
    const values = [email.toLowerCase(), username, hashedPassword, fullName, verificationToken, verificationExpires, role, isVerified, adminApproved, tier];
    const result = await db.query(query, values);
    
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, 
             two_factor_enabled, tier, created_at, updated_at
      FROM users
      WHERE id = $1 AND is_active = true
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByEmail(email) {
    const query = `
      SELECT id, email, username, password_hash, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, 
             two_factor_enabled, two_factor_secret, tier, created_at
      FROM users
      WHERE email = $1
    `;
    
    const result = await db.query(query, [email.toLowerCase()]);
    return result.rows[0];
  }

  static async findByUsername(username) {
    const query = `
      SELECT id, email, username, full_name, avatar_url, is_verified, admin_approved, is_active, timezone, tier, created_at
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
      RETURNING id, email, username, full_name, avatar_url, is_verified, admin_approved, is_active, timezone, tier, updated_at
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
      SELECT id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, tier, created_at, updated_at
      FROM users
      ORDER BY created_at DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  static async updateRole(userId, role) {
    // Determine tier based on role
    let tier = 'free';
    if (role === 'admin' || role === 'owner') {
      tier = 'pro';
    }
    
    const query = `
      UPDATE users
      SET role = $1, tier = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING id, email, username, full_name, avatar_url, role, is_verified, is_active, timezone, tier, created_at, updated_at
    `;
    
    const result = await db.query(query, [role, tier, userId]);
    return result.rows[0];
  }

  static async updateStatus(userId, isActive) {
    const query = `
      UPDATE users
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, email, username, full_name, avatar_url, role, is_verified, is_active, timezone, tier, created_at, updated_at
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
    const query = `SELECT id, email, username, full_name, avatar_url, role, is_verified, is_active, timezone, tier, created_at, updated_at FROM users WHERE role = 'owner' LIMIT 1`;
    const result = await db.query(query);
    return result.rows[0];
  }

  static async deleteUser(userId) {
    // First delete related data (user settings, etc.)
    await db.query('DELETE FROM user_settings WHERE user_id = $1', [userId]);
    
    // Note: In a production system, you might want to handle related data like trades
    // For now, we'll assume trades should be preserved or handled separately
    
    // Delete the user
    const query = `DELETE FROM users WHERE id = $1`;
    const result = await db.query(query, [userId]);
    
    return result.rowCount > 0;
  }

  static async approveUser(userId) {
    const query = `
      UPDATE users
      SET admin_approved = true, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, tier, created_at, updated_at
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  static async getPendingUsers() {
    const query = `
      SELECT id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, tier, created_at, updated_at
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

  // Tier management methods
  static async updateTier(userId, tier) {
    const query = `
      UPDATE users
      SET tier = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, tier, created_at, updated_at
    `;
    
    const result = await db.query(query, [tier, userId]);
    return result.rows[0];
  }

  static async getUserTier(userId) {
    const query = `
      SELECT u.tier, to_.tier as override_tier, to_.expires_at as override_expires
      FROM users u
      LEFT JOIN tier_overrides to_ ON u.id = to_.user_id
      WHERE u.id = $1
    `;
    
    const result = await db.query(query, [userId]);
    if (!result.rows[0]) return null;
    
    const { tier, override_tier, override_expires } = result.rows[0];
    
    // Check if override is active and not expired
    if (override_tier && (!override_expires || new Date(override_expires) > new Date())) {
      return override_tier;
    }
    
    return tier;
  }

  static async getSubscription(userId) {
    const query = `
      SELECT * FROM subscriptions
      WHERE user_id = $1
      ORDER BY 
        CASE WHEN status = 'active' THEN 1 
             WHEN status = 'trialing' THEN 2 
             ELSE 3 END,
        created_at DESC
      LIMIT 1
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  static async createOrUpdateSubscription(subscriptionData) {
    const {
      userId,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd
    } = subscriptionData;

    const query = `
      INSERT INTO subscriptions (
        user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
        status, current_period_start, current_period_end, cancel_at_period_end
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (stripe_subscription_id) 
      DO UPDATE SET
        status = EXCLUDED.status,
        current_period_start = EXCLUDED.current_period_start,
        current_period_end = EXCLUDED.current_period_end,
        cancel_at_period_end = EXCLUDED.cancel_at_period_end,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const values = [
      userId,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
      status,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async setTierOverride(userId, tier, reason, expiresAt, createdBy) {
    const query = `
      INSERT INTO tier_overrides (user_id, tier, reason, expires_at, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) 
      DO UPDATE SET
        tier = EXCLUDED.tier,
        reason = EXCLUDED.reason,
        expires_at = EXCLUDED.expires_at,
        created_by = EXCLUDED.created_by,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const values = [userId, tier, reason, expiresAt, createdBy];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  static async removeTierOverride(userId) {
    const query = `
      DELETE FROM tier_overrides
      WHERE user_id = $1
      RETURNING *
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  static async getTierOverride(userId) {
    const query = `
      SELECT to_.*, u.username as created_by_username
      FROM tier_overrides to_
      LEFT JOIN users u ON to_.created_by = u.id
      WHERE to_.user_id = $1
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  static async createTierOverride(userId, tier, reason, expiresAt, createdBy = null) {
    const query = `
      INSERT INTO tier_overrides (user_id, tier, reason, expires_at, created_by)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) 
      DO UPDATE SET
        tier = EXCLUDED.tier,
        reason = EXCLUDED.reason,
        expires_at = EXCLUDED.expires_at,
        created_by = EXCLUDED.created_by,
        updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const result = await db.query(query, [userId, tier, reason, expiresAt, createdBy]);
    return result.rows[0];
  }
}

module.exports = User;