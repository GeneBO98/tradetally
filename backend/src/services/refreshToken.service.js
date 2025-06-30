const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class RefreshTokenService {
  constructor() {
    this.ACCESS_TOKEN_EXPIRE = process.env.ACCESS_TOKEN_EXPIRE || '15m';
    this.REFRESH_TOKEN_EXPIRE = process.env.REFRESH_TOKEN_EXPIRE || '30d';
  }

  /**
   * Generate access token (short-lived)
   */
  generateAccessToken(user) {
    return jwt.sign(
      { 
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: this.ACCESS_TOKEN_EXPIRE }
    );
  }

  /**
   * Generate refresh token (long-lived, hashed and stored)
   */
  async generateRefreshToken(userId, deviceId = null) {
    const tokenValue = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(tokenValue).digest('hex');
    const familyId = uuidv4();
    
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.getRefreshTokenDays());

    // Store hashed token in database
    const result = await db.query(`
      INSERT INTO refresh_tokens (user_id, device_id, token_hash, family_id, expires_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, family_id, expires_at
    `, [userId, deviceId, tokenHash, familyId, expiresAt]);

    return {
      token: tokenValue,
      id: result.rows[0].id,
      familyId: result.rows[0].family_id,
      expiresAt: result.rows[0].expires_at
    };
  }

  /**
   * Verify and rotate refresh token
   */
  async refreshAccessToken(refreshToken, deviceId = null) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Find the refresh token
    const result = await db.query(`
      SELECT rt.id, rt.user_id, rt.device_id, rt.family_id, rt.expires_at, rt.revoked_at,
             u.id as user_id, u.email, u.username, u.role, u.is_active, u.is_verified
      FROM refresh_tokens rt
      JOIN users u ON rt.user_id = u.id
      WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL
    `, [tokenHash]);

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired refresh token');
    }

    const tokenData = result.rows[0];

    // Check if token is expired
    if (new Date() > new Date(tokenData.expires_at)) {
      // Clean up expired token
      await this.revokeRefreshToken(tokenData.id);
      throw new Error('Refresh token expired');
    }

    // Check if user is still active and verified
    if (!tokenData.is_active) {
      throw new Error('User account is inactive');
    }

    // Check device match if device tracking is enabled
    if (deviceId && tokenData.device_id && tokenData.device_id !== deviceId) {
      // Potential token theft - revoke entire family
      await this.revokeTokenFamily(tokenData.family_id);
      throw new Error('Device mismatch - token family revoked');
    }

    // Mark current token as used
    await db.query(`
      UPDATE refresh_tokens 
      SET used_at = CURRENT_TIMESTAMP 
      WHERE id = $1
    `, [tokenData.id]);

    // Generate new access token
    const user = {
      id: tokenData.user_id,
      email: tokenData.email,
      username: tokenData.username,
      role: tokenData.role
    };

    const accessToken = this.generateAccessToken(user);

    // Generate new refresh token (token rotation)
    const newRefreshToken = await this.generateRefreshToken(tokenData.user_id, tokenData.device_id);

    // Revoke old refresh token
    await this.revokeRefreshToken(tokenData.id);

    return {
      accessToken,
      refreshToken: newRefreshToken.token,
      expiresIn: this.getAccessTokenSeconds(),
      user
    };
  }

  /**
   * Revoke a specific refresh token
   */
  async revokeRefreshToken(tokenId, reason = 'manual') {
    await db.query(`
      UPDATE refresh_tokens 
      SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $2
      WHERE id = $1
    `, [tokenId, reason]);
  }

  /**
   * Revoke all refresh tokens for a user
   */
  async revokeUserTokens(userId, reason = 'logout_all') {
    await db.query(`
      UPDATE refresh_tokens 
      SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $2
      WHERE user_id = $1 AND revoked_at IS NULL
    `, [userId, reason]);
  }

  /**
   * Revoke all refresh tokens for a device
   */
  async revokeDeviceTokens(deviceId, reason = 'device_logout') {
    await db.query(`
      UPDATE refresh_tokens 
      SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $2
      WHERE device_id = $1 AND revoked_at IS NULL
    `, [deviceId, reason]);
  }

  /**
   * Revoke token family (for security incidents)
   */
  async revokeTokenFamily(familyId, reason = 'security_incident') {
    await db.query(`
      UPDATE refresh_tokens 
      SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $2
      WHERE family_id = $1 AND revoked_at IS NULL
    `, [familyId, reason]);
  }

  /**
   * Get active tokens for a user
   */
  async getUserTokens(userId) {
    const result = await db.query(`
      SELECT rt.id, rt.device_id, rt.created_at, rt.expires_at, rt.used_at,
             d.device_name, d.device_type, d.last_active
      FROM refresh_tokens rt
      LEFT JOIN devices d ON rt.device_id = d.id
      WHERE rt.user_id = $1 AND rt.revoked_at IS NULL
      ORDER BY rt.created_at DESC
    `, [userId]);

    return result.rows;
  }

  /**
   * Clean up expired tokens (for maintenance)
   */
  async cleanupExpiredTokens() {
    const result = await db.query(`
      UPDATE refresh_tokens 
      SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'expired'
      WHERE expires_at < CURRENT_TIMESTAMP AND revoked_at IS NULL
      RETURNING id
    `);

    return result.rows.length;
  }

  /**
   * Get token statistics (for monitoring)
   */
  async getTokenStats() {
    const result = await db.query(`
      SELECT 
        COUNT(*) as total_tokens,
        COUNT(*) FILTER (WHERE revoked_at IS NULL) as active_tokens,
        COUNT(*) FILTER (WHERE expires_at < CURRENT_TIMESTAMP) as expired_tokens,
        COUNT(*) FILTER (WHERE used_at IS NOT NULL) as used_tokens
      FROM refresh_tokens
    `);

    return result.rows[0];
  }

  /**
   * Validate refresh token format
   */
  isValidRefreshTokenFormat(token) {
    return typeof token === 'string' && token.length === 80 && /^[a-f0-9]+$/.test(token);
  }

  /**
   * Convert refresh token expiry to days
   */
  getRefreshTokenDays() {
    const expire = this.REFRESH_TOKEN_EXPIRE;
    if (expire.endsWith('d')) {
      return parseInt(expire.slice(0, -1));
    }
    return 30; // default
  }

  /**
   * Convert access token expiry to seconds
   */
  getAccessTokenSeconds() {
    const expire = this.ACCESS_TOKEN_EXPIRE;
    if (expire.endsWith('m')) {
      return parseInt(expire.slice(0, -1)) * 60;
    } else if (expire.endsWith('h')) {
      return parseInt(expire.slice(0, -1)) * 3600;
    }
    return 900; // 15 minutes default
  }
}

module.exports = new RefreshTokenService();