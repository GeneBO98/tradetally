const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class OAuth2Service {
  constructor() {
    this.AUTHORIZATION_CODE_EXPIRE = 10 * 60 * 1000; // 10 minutes
    this.ACCESS_TOKEN_EXPIRE = process.env.OAUTH2_ACCESS_TOKEN_EXPIRE || '1h';
    this.REFRESH_TOKEN_EXPIRE = process.env.OAUTH2_REFRESH_TOKEN_EXPIRE || '30d';
  }

  /**
   * Generate a random secure token
   */
  generateSecureToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Hash a token using bcrypt
   */
  async hashToken(token) {
    return await bcrypt.hash(token, 10);
  }

  /**
   * Verify a token against its hash
   */
  async verifyToken(token, hash) {
    return await bcrypt.compare(token, hash);
  }

  /**
   * Generate PKCE code challenge
   */
  generateCodeChallenge(codeVerifier, method = 'S256') {
    if (method === 'plain') {
      return codeVerifier;
    }
    // S256
    return crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Verify PKCE code challenge
   */
  verifyCodeChallenge(codeVerifier, codeChallenge, method = 'S256') {
    const computedChallenge = this.generateCodeChallenge(codeVerifier, method);
    return computedChallenge === codeChallenge;
  }

  /**
   * Register a new OAuth2 client
   */
  async registerClient(data, createdBy) {
    const clientId = this.generateSecureToken(16);
    const clientSecret = this.generateSecureToken(32);
    const clientSecretHash = await this.hashToken(clientSecret);

    const query = `
      INSERT INTO oauth_clients (
        client_id, client_secret_hash, name, description,
        redirect_uris, allowed_scopes, logo_url, website_url,
        is_trusted, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await db.query(query, [
      clientId,
      clientSecretHash,
      data.name,
      data.description || null,
      data.redirectUris,
      data.allowedScopes || ['openid', 'profile', 'email'],
      data.logoUrl || null,
      data.websiteUrl || null,
      data.isTrusted || false,
      createdBy
    ]);

    return {
      ...result.rows[0],
      client_secret: clientSecret // Return plain secret only on creation
    };
  }

  /**
   * Get OAuth2 client by client_id
   */
  async getClient(clientId) {
    const query = 'SELECT * FROM oauth_clients WHERE client_id = $1';
    const result = await db.query(query, [clientId]);
    return result.rows[0] || null;
  }

  /**
   * Verify client credentials
   */
  async verifyClientCredentials(clientId, clientSecret) {
    const client = await this.getClient(clientId);
    if (!client) return null;

    const isValid = await this.verifyToken(clientSecret, client.client_secret_hash);
    return isValid ? client : null;
  }

  /**
   * Validate redirect URI
   */
  validateRedirectUri(client, redirectUri) {
    return client.redirect_uris.includes(redirectUri);
  }

  /**
   * Validate requested scopes
   */
  validateScopes(client, requestedScopes) {
    if (!requestedScopes || requestedScopes.length === 0) {
      return true;
    }
    return requestedScopes.every(scope => client.allowed_scopes.includes(scope));
  }

  /**
   * Create authorization code
   */
  async createAuthorizationCode(data) {
    const code = this.generateSecureToken(32);
    const expiresAt = new Date(Date.now() + this.AUTHORIZATION_CODE_EXPIRE);

    const query = `
      INSERT INTO oauth_authorization_codes (
        code, client_id, user_id, redirect_uri, scopes,
        code_challenge, code_challenge_method, nonce, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    await db.query(query, [
      code,
      data.clientId,
      data.userId,
      data.redirectUri,
      data.scopes,
      data.codeChallenge || null,
      data.codeChallengeMethod || null,
      data.nonce || null,
      expiresAt
    ]);

    return code;
  }

  /**
   * Verify and consume authorization code
   */
  async verifyAuthorizationCode(code, clientId, redirectUri, codeVerifier = null) {
    const query = `
      SELECT * FROM oauth_authorization_codes
      WHERE code = $1 AND client_id = (
        SELECT id FROM oauth_clients WHERE client_id = $2
      )
    `;

    const result = await db.query(query, [code, clientId]);
    const authCode = result.rows[0];

    if (!authCode) {
      throw new Error('Invalid authorization code');
    }

    if (authCode.used_at) {
      throw new Error('Authorization code already used');
    }

    if (new Date() > new Date(authCode.expires_at)) {
      throw new Error('Authorization code expired');
    }

    if (authCode.redirect_uri !== redirectUri) {
      throw new Error('Redirect URI mismatch');
    }

    // Verify PKCE if code_challenge was provided
    if (authCode.code_challenge) {
      if (!codeVerifier) {
        throw new Error('Code verifier required');
      }
      if (!this.verifyCodeChallenge(codeVerifier, authCode.code_challenge, authCode.code_challenge_method)) {
        throw new Error('Invalid code verifier');
      }
    }

    // Mark code as used
    await db.query(
      'UPDATE oauth_authorization_codes SET used_at = NOW() WHERE id = $1',
      [authCode.id]
    );

    return authCode;
  }

  /**
   * Create access token
   */
  async createAccessToken(data) {
    const token = this.generateSecureToken(32);
    const tokenHash = await this.hashToken(token);

    // Parse expiry time (e.g., '1h', '30m')
    const expiresAt = this.parseExpiry(this.ACCESS_TOKEN_EXPIRE);

    const query = `
      INSERT INTO oauth_access_tokens (
        token_hash, client_id, user_id, scopes, expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, expires_at
    `;

    const result = await db.query(query, [
      tokenHash,
      data.clientId,
      data.userId,
      data.scopes,
      expiresAt
    ]);

    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: Math.floor((expiresAt - Date.now()) / 1000),
      scope: data.scopes.join(' '),
      token_id: result.rows[0].id
    };
  }

  /**
   * Create refresh token
   */
  async createRefreshToken(data) {
    const token = this.generateSecureToken(32);
    const tokenHash = await this.hashToken(token);

    const expiresAt = this.parseExpiry(this.REFRESH_TOKEN_EXPIRE);

    const query = `
      INSERT INTO oauth_refresh_tokens (
        token_hash, access_token_id, client_id, user_id, scopes, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;

    await db.query(query, [
      tokenHash,
      data.accessTokenId,
      data.clientId,
      data.userId,
      data.scopes,
      expiresAt
    ]);

    return token;
  }

  /**
   * Verify access token
   */
  async verifyAccessToken(token) {
    const query = `
      SELECT at.*, u.email, u.username, u.full_name, u.role
      FROM oauth_access_tokens at
      JOIN users u ON at.user_id = u.id
      WHERE at.revoked_at IS NULL
        AND at.expires_at > NOW()
    `;

    const result = await db.query(query);

    for (const row of result.rows) {
      const isValid = await this.verifyToken(token, row.token_hash);
      if (isValid) {
        return row;
      }
    }

    return null;
  }

  /**
   * Verify refresh token and create new access token
   */
  async refreshAccessToken(refreshToken, clientId) {
    const query = `
      SELECT rt.*, c.client_id
      FROM oauth_refresh_tokens rt
      JOIN oauth_clients c ON rt.client_id = c.id
      WHERE c.client_id = $1
        AND rt.revoked_at IS NULL
        AND rt.expires_at > NOW()
    `;

    const result = await db.query(query, [clientId]);

    for (const row of result.rows) {
      const isValid = await this.verifyToken(refreshToken, row.token_hash);
      if (isValid) {
        // Create new access token
        const accessToken = await this.createAccessToken({
          clientId: row.client_id,
          userId: row.user_id,
          scopes: row.scopes
        });

        // Update refresh token's access_token_id
        await db.query(
          'UPDATE oauth_refresh_tokens SET access_token_id = $1 WHERE id = $2',
          [accessToken.token_id, row.id]
        );

        return accessToken;
      }
    }

    throw new Error('Invalid refresh token');
  }

  /**
   * Revoke token
   */
  async revokeToken(token) {
    // Try to revoke as access token
    const accessQuery = `
      UPDATE oauth_access_tokens
      SET revoked_at = NOW()
      WHERE revoked_at IS NULL
    `;
    const accessResult = await db.query(accessQuery);

    if (accessResult.rowCount > 0) {
      // Also revoke associated refresh tokens
      await db.query(`
        UPDATE oauth_refresh_tokens
        SET revoked_at = NOW()
        WHERE access_token_id IN (
          SELECT id FROM oauth_access_tokens WHERE revoked_at IS NOT NULL
        ) AND revoked_at IS NULL
      `);
      return true;
    }

    // Try to revoke as refresh token
    const refreshQuery = `
      UPDATE oauth_refresh_tokens
      SET revoked_at = NOW()
      WHERE revoked_at IS NULL
    `;
    const refreshResult = await db.query(refreshQuery);

    return refreshResult.rowCount > 0;
  }

  /**
   * Get or create user consent
   */
  async getUserConsent(userId, clientId) {
    const query = `
      SELECT uc.*, c.name as client_name
      FROM oauth_user_consents uc
      JOIN oauth_clients c ON uc.client_id = c.id
      WHERE uc.user_id = $1 AND c.client_id = $2
    `;

    const result = await db.query(query, [userId, clientId]);
    return result.rows[0] || null;
  }

  /**
   * Create or update user consent
   */
  async createUserConsent(userId, clientId, scopes) {
    const clientQuery = 'SELECT id FROM oauth_clients WHERE client_id = $1';
    const clientResult = await db.query(clientQuery, [clientId]);

    if (clientResult.rows.length === 0) {
      throw new Error('Client not found');
    }

    const clientUuid = clientResult.rows[0].id;

    const query = `
      INSERT INTO oauth_user_consents (user_id, client_id, scopes)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, client_id)
      DO UPDATE SET scopes = $3, updated_at = NOW()
      RETURNING *
    `;

    const result = await db.query(query, [userId, clientUuid, scopes]);
    return result.rows[0];
  }

  /**
   * Revoke user consent
   */
  async revokeUserConsent(userId, clientId) {
    const query = `
      DELETE FROM oauth_user_consents
      WHERE user_id = $1 AND client_id = (
        SELECT id FROM oauth_clients WHERE client_id = $2
      )
    `;

    const result = await db.query(query, [userId, clientId]);
    return result.rowCount > 0;
  }

  /**
   * Get user's authorized clients
   */
  async getUserAuthorizedClients(userId) {
    const query = `
      SELECT c.*, uc.scopes, uc.updated_at as authorized_at
      FROM oauth_user_consents uc
      JOIN oauth_clients c ON uc.client_id = c.id
      WHERE uc.user_id = $1
      ORDER BY uc.updated_at DESC
    `;

    const result = await db.query(query, [userId]);
    return result.rows;
  }

  /**
   * List all clients (admin only)
   */
  async listClients(createdBy = null) {
    let query = 'SELECT * FROM oauth_clients';
    const values = [];

    if (createdBy) {
      query += ' WHERE created_by = $1';
      values.push(createdBy);
    }

    query += ' ORDER BY created_at DESC';

    const result = await db.query(query, values);
    return result.rows;
  }

  /**
   * Delete client
   */
  async deleteClient(clientId, userId) {
    const query = `
      DELETE FROM oauth_clients
      WHERE client_id = $1 AND created_by = $2
      RETURNING *
    `;

    const result = await db.query(query, [clientId, userId]);
    return result.rows[0] || null;
  }

  /**
   * Parse expiry time string to Date
   */
  parseExpiry(expiry) {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error('Invalid expiry format');
    }

    const [, value, unit] = match;
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    const milliseconds = parseInt(value) * multipliers[unit];

    return new Date(Date.now() + milliseconds);
  }

  /**
   * Clean up expired tokens and codes
   */
  async cleanupExpired() {
    await db.query('DELETE FROM oauth_authorization_codes WHERE expires_at < NOW()');
    await db.query('DELETE FROM oauth_access_tokens WHERE expires_at < NOW() AND revoked_at IS NULL');
    await db.query('DELETE FROM oauth_refresh_tokens WHERE expires_at < NOW() AND revoked_at IS NULL');
  }
}

module.exports = new OAuth2Service();
