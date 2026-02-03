const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create({ email, username, password, fullName, verificationToken, verificationExpires, role = 'user', isVerified = false, adminApproved = true, tier = 'free', marketingConsent = false }) {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Admins get Pro tier by default
    if (role === 'admin' || role === 'owner') {
      tier = 'pro';
    }

    const query = `
      INSERT INTO users (email, username, password_hash, full_name, verification_token, verification_expires, role, is_verified, admin_approved, tier, marketing_consent)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, tier, marketing_consent, created_at
    `;

    const values = [email.toLowerCase(), username, hashedPassword, fullName, verificationToken, verificationExpires, role, isVerified, adminApproved, tier, marketingConsent];
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

  static async findByIdForAdmin(id) {
    const query = `
      SELECT id, email, username, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone, 
             two_factor_enabled, tier, created_at, updated_at
      FROM users
      WHERE id = $1
    `;
    
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByEmail(email) {
    const query = `
      SELECT id, email, username, password_hash, full_name, avatar_url, role, is_verified, admin_approved, is_active, timezone,
             two_factor_enabled, two_factor_secret, tier, created_at, last_login_at
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
    
    try {
      const result = await db.query(query, [userId]);
      const settings = result.rows[0];
      
      // Provide default for statisticsCalculation if column doesn't exist yet
      if (settings && !settings.hasOwnProperty('statistics_calculation')) {
        settings.statistics_calculation = 'average';
      }
      
      return settings;
    } catch (error) {
      // If column doesn't exist, gracefully handle it
      if (error.message.includes('statistics_calculation')) {
        console.warn('statistics_calculation column not yet migrated, using default');
        const query = `SELECT * FROM user_settings WHERE user_id = $1`;
        const result = await db.query(query, [userId]);
        const settings = result.rows[0];
        if (settings) {
          settings.statistics_calculation = 'average';
        }
        return settings;
      }
      throw error;
    }
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
      preferredSectors: 'preferred_sectors',
      statisticsCalculation: 'statistics_calculation',
      defaultBroker: 'default_broker',
      enableTradeGrouping: 'enable_trade_grouping',
      tradeGroupingTimeGapMinutes: 'trade_grouping_time_gap_minutes',
      autoCloseExpiredOptions: 'auto_close_expired_options',
      analyticsChartLayout: 'analytics_chart_layout',
      dashboardLayout: 'dashboard_layout',
      defaultStopLossPercent: 'default_stop_loss_percent',
      defaultTakeProfitPercent: 'default_take_profit_percent',
      defaultStopLossType: 'default_stop_loss_type',
      defaultStopLossDollars: 'default_stop_loss_dollars'
    };

    Object.entries(settings).forEach(([key, value]) => {
      if (key !== 'user_id' && key !== 'id') {
        const dbColumn = columnMapping[key] || key;
        // For JSONB columns, ensure proper casting and JSON serialization
        if (dbColumn === 'analytics_chart_layout' || dbColumn === 'dashboard_layout') {
          fields.push(`${dbColumn} = $${paramCount}::jsonb`);
          // PostgreSQL JSONB requires JSON string, not JavaScript object
          values.push(value ? JSON.stringify(value) : null);
        } else {
          fields.push(`${dbColumn} = $${paramCount}`);
          values.push(value);
        }
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

    try {
      const result = await db.query(query, values);
      
      // Log if dashboard_layout was saved
      if (settings.dashboardLayout) {
        console.log('[SETTINGS] Dashboard layout saved successfully');
      }

      // If default stop loss was updated, apply it to existing trades without a stop loss
      const stopLossType = settings.defaultStopLossType || 'percent';
      if (stopLossType === 'dollar' && settings.defaultStopLossDollars !== undefined && settings.defaultStopLossDollars > 0) {
        const Trade = require('./Trade');
        Trade.applyDefaultStopLossToExistingTradesByDollars(userId, settings.defaultStopLossDollars)
          .then(count => {
            console.log(`[SETTINGS] Applied default dollar stop loss to ${count} existing trades`);
          })
          .catch(error => {
            console.error('[SETTINGS] Failed to apply default dollar stop loss to existing trades:', error);
          });
      } else if (settings.defaultStopLossPercent !== undefined && settings.defaultStopLossPercent > 0) {
        const Trade = require('./Trade');
        Trade.applyDefaultStopLossToExistingTrades(userId, settings.defaultStopLossPercent)
          .then(count => {
            console.log(`[SETTINGS] Applied default stop loss to ${count} existing trades`);
          })
          .catch(error => {
            console.error('[SETTINGS] Failed to apply default stop loss to existing trades:', error);
          });
      }

      // If default take profit percentage was updated, apply it to existing trades without a take profit
      if (settings.defaultTakeProfitPercent !== undefined && settings.defaultTakeProfitPercent > 0) {
        const Trade = require('./Trade');
        Trade.applyDefaultTakeProfitToExistingTrades(userId, settings.defaultTakeProfitPercent)
          .then(count => {
            console.log(`[SETTINGS] Applied default take profit to ${count} existing trades`);
          })
          .catch(error => {
            console.error('[SETTINGS] Failed to apply default take profit to existing trades:', error);
          });
      }

      return result.rows[0];
    } catch (error) {
      console.error('[SETTINGS] Error updating user settings:', error.message);
      // Check if error is related to missing column
      if (error.message && error.message.includes('dashboard_layout')) {
        console.error('[SETTINGS] ERROR: dashboard_layout column may not exist. Please run migration 140_add_dashboard_layout.sql');
      }
      // If statistics_calculation column doesn't exist, try update without it
      if (error.message.includes('statistics_calculation') && settings.statisticsCalculation) {
        console.warn('statistics_calculation column not yet migrated, skipping field');
        const filteredFields = fields.filter(field => !field.includes('statistics_calculation'));
        const filteredValues = values.filter((value, index) => {
          const field = fields[index];
          return field && !field.includes('statistics_calculation');
        });

        if (filteredFields.length > 0) {
          const fallbackQuery = `
            UPDATE user_settings
            SET ${filteredFields.join(', ')}
            WHERE user_id = $${filteredValues.length + 1}
            RETURNING *
          `;
          filteredValues.push(userId);
          const result = await db.query(fallbackQuery, filteredValues);

          // If default stop loss was updated, apply it to existing trades without a stop loss
          const stopLossTypeFallback = settings.defaultStopLossType || 'percent';
          if (stopLossTypeFallback === 'dollar' && settings.defaultStopLossDollars !== undefined && settings.defaultStopLossDollars > 0) {
            const Trade = require('./Trade');
            Trade.applyDefaultStopLossToExistingTradesByDollars(userId, settings.defaultStopLossDollars)
              .then(count => {
                console.log(`[SETTINGS] Applied default dollar stop loss to ${count} existing trades`);
              })
              .catch(error => {
                console.error('[SETTINGS] Failed to apply default dollar stop loss to existing trades:', error);
              });
          } else if (settings.defaultStopLossPercent !== undefined && settings.defaultStopLossPercent > 0) {
            const Trade = require('./Trade');
            Trade.applyDefaultStopLossToExistingTrades(userId, settings.defaultStopLossPercent)
              .then(count => {
                console.log(`[SETTINGS] Applied default stop loss to ${count} existing trades`);
              })
              .catch(error => {
                console.error('[SETTINGS] Failed to apply default stop loss to existing trades:', error);
              });
          }

          // If default take profit percentage was updated, apply it to existing trades without a take profit
          if (settings.defaultTakeProfitPercent !== undefined && settings.defaultTakeProfitPercent > 0) {
            const Trade = require('./Trade');
            Trade.applyDefaultTakeProfitToExistingTrades(userId, settings.defaultTakeProfitPercent)
              .then(count => {
                console.log(`[SETTINGS] Applied default take profit to ${count} existing trades`);
              })
              .catch(error => {
                console.error('[SETTINGS] Failed to apply default take profit to existing trades:', error);
              });
          }

          return result.rows[0];
        }
      }
      throw error;
    }
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

  static async updateLastLogin(userId) {
    const query = `
      UPDATE users
      SET last_login_at = NOW()
      WHERE id = $1
      RETURNING last_login_at
    `;

    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  static async markOnboardingCompleted(userId) {
    const query = `
      UPDATE user_settings
      SET onboarding_completed_at = NOW()
      WHERE user_id = $1
      RETURNING onboarding_completed_at
    `;
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  static async getUserCount() {
    const query = `SELECT COUNT(*) as count FROM users WHERE is_active = true`;
    const result = await db.query(query);
    return parseInt(result.rows[0].count);
  }

  // Admin user management methods
  static async getAllUsers(limit = 25, offset = 0, search = '') {
    try {
      // First try a simple query to test basic functionality
      const simpleQuery = `SELECT COUNT(*) as total FROM users`;
      const countResult = await db.query(simpleQuery);
      
      // If search is provided, add search condition
      let whereClause = '';
      let params = [];
      if (search && search.trim() !== '') {
        whereClause = `WHERE (u.email ILIKE $1 OR u.username ILIKE $1 OR u.full_name ILIKE $1)`;
        params.push(`%${search.trim()}%`);
      }

      // Get users with pagination, including trial status from tier_overrides
      const userQuery = `
        SELECT
          u.id, u.email, u.username, u.full_name, u.avatar_url, u.role,
          u.is_verified, u.admin_approved, u.is_active, u.timezone, u.tier,
          u.marketing_consent, u.created_at, u.updated_at,
          CASE
            WHEN tov.id IS NOT NULL AND tov.reason ILIKE '%trial%' AND (tov.expires_at IS NULL OR tov.expires_at > NOW())
            THEN true
            ELSE false
          END as is_trial
        FROM users u
        LEFT JOIN tier_overrides tov ON u.id = tov.user_id
          AND tov.tier = 'pro'
          AND (tov.expires_at IS NULL OR tov.expires_at > NOW())
        ${whereClause}
        ORDER BY u.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(limit, offset);

      const userResult = await db.query(userQuery, params);
      
      // Get filtered count if search was provided
      let total = parseInt(countResult.rows[0].total);
      if (search && search.trim() !== '') {
        const filteredCountQuery = `SELECT COUNT(*) as total FROM users ${whereClause}`;
        const filteredCountResult = await db.query(filteredCountQuery, [params[0]]);
        total = parseInt(filteredCountResult.rows[0].total);
      }
      
      return {
        users: userResult.rows,
        total: total
      };
    } catch (error) {
      console.error('Error in getAllUsers:', error);
      throw error;
    }
  }

  static async getUserStatistics() {
    const query = `
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN is_verified = true THEN 1 END) as verified_users,
        COUNT(CASE WHEN admin_approved = true THEN 1 END) as approved_users,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_users,
        COUNT(CASE WHEN role = 'admin' THEN 1 END) as admin_users,
        COUNT(CASE WHEN tier = 'pro' THEN 1 END) as pro_users,
        COUNT(CASE WHEN tier = 'free' THEN 1 END) as free_users,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '7 days' THEN 1 END) as new_users_this_week,
        COUNT(CASE WHEN created_at >= CURRENT_DATE - INTERVAL '30 days' THEN 1 END) as new_users_this_month
      FROM users
    `;
    
    const result = await db.query(query);
    return result.rows[0];
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

  static async deleteUser(userId, options = {}) {
    const { deletionType = 'admin', deletedByAdminId = null } = options;

    // Start a transaction to ensure all deletions succeed or fail together
    const client = await db.pool.connect();

    try {
      await client.query('BEGIN');

      // Capture user info before deletion for analytics tracking
      const userInfoQuery = `
        SELECT id, username, email, tier, created_at,
          (SELECT COUNT(*) FROM trades WHERE user_id = $1) as trade_count
        FROM users WHERE id = $1
      `;
      const userInfoResult = await client.query(userInfoQuery, [userId]);
      const userInfo = userInfoResult.rows[0];

      // Log the deletion for analytics (before deleting the user)
      if (userInfo) {
        await client.query(`
          INSERT INTO account_deletions (
            deleted_user_id, deleted_username, deleted_email, deletion_type,
            deleted_by_admin_id, user_created_at, user_tier, trade_count
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
          userId,
          userInfo.username,
          userInfo.email,
          deletionType,
          deletedByAdminId,
          userInfo.created_at,
          userInfo.tier,
          parseInt(userInfo.trade_count) || 0
        ]);
      }

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
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      
      // Insert/update the override record
      const overrideQuery = `
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
      
      // Also update the users table so simple queries return correct tier
      const userUpdateQuery = `
        UPDATE users SET tier = $1, updated_at = CURRENT_TIMESTAMP 
        WHERE id = $2
      `;
      
      const result = await client.query(overrideQuery, [userId, tier, reason, expiresAt, createdBy]);
      await client.query(userUpdateQuery, [tier, userId]);
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async removeTierOverride(userId) {
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      
      // Remove the override record
      const deleteQuery = `
        DELETE FROM tier_overrides
        WHERE user_id = $1
        RETURNING *
      `;
      
      // Reset user tier to base tier (free unless admin)
      const resetTierQuery = `
        UPDATE users 
        SET tier = CASE 
          WHEN role IN ('admin', 'owner') THEN 'pro'
          ELSE 'free'
        END,
        updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `;
      
      const result = await client.query(deleteQuery, [userId]);
      await client.query(resetTierQuery, [userId]);
      
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
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