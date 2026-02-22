const oauth2Service = require('../services/oauth2.service');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

function normalizePem(value = '') {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

function readPemFromEnvOrFile(envVar, pathVar, defaultRelativePath) {
  const inlineValue = process.env[envVar];
  if (inlineValue && inlineValue.trim()) {
    return normalizePem(inlineValue.trim());
  }

  const filePath = process.env[pathVar] || path.join(__dirname, defaultRelativePath);
  return fs.readFileSync(filePath, 'utf8');
}

function getOAuthPrivateKey() {
  try {
    return readPemFromEnvOrFile(
      'OAUTH_PRIVATE_KEY',
      'OAUTH_PRIVATE_KEY_PATH',
      '../keys/oauth-private.pem'
    );
  } catch (error) {
    throw new Error(
      `OAuth private key not configured. Set OAUTH_PRIVATE_KEY or OAUTH_PRIVATE_KEY_PATH. (${error.message})`
    );
  }
}

function getOAuthPublicKey() {
  try {
    return readPemFromEnvOrFile(
      'OAUTH_PUBLIC_KEY',
      'OAUTH_PUBLIC_KEY_PATH',
      '../keys/oauth-public.pem'
    );
  } catch {
    // Fall back to deriving the public key from the configured private key.
    const crypto = require('crypto');
    const privateKey = getOAuthPrivateKey();
    return crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
  }
}

/**
 * GET /oauth/authorize
 * Authorization endpoint - displays consent screen or redirects with code
 */
const authorize = async (req, res) => {
  try {
    console.log('[OAuth] ===== GET /oauth/authorize called =====');
    console.log('[OAuth] User authenticated:', !!req.user);
    console.log('[OAuth] Query params:', req.query);

    const {
      response_type,
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method
    } = req.query;

    // Validate required parameters
    if (!response_type || response_type !== 'code') {
      console.error('[OAuth] Invalid response_type:', response_type);
      return res.status(400).json({ error: 'invalid_request', error_description: 'response_type must be "code"' });
    }

    if (!client_id || !redirect_uri) {
      console.error('[OAuth] Missing required parameters');
      return res.status(400).json({ error: 'invalid_request', error_description: 'Missing required parameters' });
    }

    // Get client
    const client = await oauth2Service.getClient(client_id);
    if (!client) {
      console.error('[OAuth] Client not found:', client_id);
      return res.status(400).json({ error: 'invalid_client', error_description: 'Client not found' });
    }
    console.log('[OAuth] Client found:', client.name, 'Trusted:', client.is_trusted);

    // Validate redirect URI
    console.log('[OAuth] Validating redirect_uri:', redirect_uri);
    console.log('[OAuth] Allowed redirect_uris:', client.redirect_uris);
    if (!oauth2Service.validateRedirectUri(client, redirect_uri)) {
      console.error('[OAuth] Redirect URI validation failed!');
      return res.status(400).json({ error: 'invalid_request', error_description: 'Invalid redirect_uri' });
    }

    // Parse and validate scopes
    const requestedScopes = scope ? scope.split(' ') : ['openid', 'profile', 'email'];
    if (!oauth2Service.validateScopes(client, requestedScopes)) {
      return res.status(400).json({ error: 'invalid_scope', error_description: 'Invalid scope requested' });
    }

    // Check if user is authenticated
    if (!req.user) {
      console.log('[OAuth] User not authenticated, redirecting to login');
      console.log('[OAuth] Original URL:', req.originalUrl);

      // Redirect to login with return URL
      const returnUrl = encodeURIComponent(req.originalUrl);
      return res.redirect(`/login?return_url=${returnUrl}`);
    }
    console.log('[OAuth] User authenticated as:', req.user.username);

    // Check if user has already consented (or if client is trusted)
    const existingConsent = await oauth2Service.getUserConsent(req.user.id, client_id);
    const needsConsent = !client.is_trusted && !existingConsent;

    if (needsConsent) {
      // Return data for consent screen (SPA only)
      return res.json({
        needs_consent: true,
        client: {
          name: client.name,
          description: client.description,
          logo_url: client.logo_url,
          website_url: client.website_url
        },
        scopes: requestedScopes,
        state,
        redirect_uri
      });
    }

    // Generate authorization code
    const code = await oauth2Service.createAuthorizationCode({
      clientId: client.id,
      userId: req.user.id,
      redirectUri: redirect_uri,
      scopes: requestedScopes,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || 'plain',
      nonce: req.query.nonce  // Store nonce for OIDC
    });

    // Build redirect URL
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.append('code', code);
    if (state) {
      redirectUrl.searchParams.append('state', state);
    }

    console.log('[OAuth] Auto-approving trusted client, redirecting to:', redirectUrl.toString());

    // Check if this is a browser request (from external OAuth client like Discourse)
    const acceptHeader = req.headers.accept || '';
    const isHtmlRequest = acceptHeader.includes('text/html') || acceptHeader.includes('*/*');

    if (isHtmlRequest) {
      // Do actual HTTP redirect for external OAuth clients like Discourse
      console.log('[OAuth] Detected browser request, performing HTTP redirect');
      return res.redirect(redirectUrl.toString());
    } else {
      // Return redirect URL for frontend to handle (frontend will do window.location.href)
      res.json({ redirect_url: redirectUrl.toString() });
    }
  } catch (error) {
    console.error('Authorization error:', error);
    res.status(500).json({ error: 'server_error', error_description: error.message });
  }
};

/**
 * POST /oauth/authorize
 * User approves or denies authorization
 */
const authorizeApprove = async (req, res) => {
  try {
    const {
      client_id,
      redirect_uri,
      scope,
      state,
      code_challenge,
      code_challenge_method,
      approved
    } = req.body;

    if (!req.user) {
      return res.status(401).json({ error: 'unauthorized', error_description: 'User not authenticated' });
    }

    // User denied
    if (!approved) {
      const redirectUrl = new URL(redirect_uri);
      redirectUrl.searchParams.append('error', 'access_denied');
      redirectUrl.searchParams.append('error_description', 'User denied authorization');
      if (state) {
        redirectUrl.searchParams.append('state', state);
      }
      // Check if this is a browser request (from external OAuth client like Discourse)
      const acceptHeader = req.headers.accept || '';
      const isHtmlRequest = acceptHeader.includes('text/html') || acceptHeader.includes('*/*');

      if (isHtmlRequest) {
        // Do actual HTTP redirect for external OAuth clients like Discourse
        return res.redirect(redirectUrl.toString());
      } else {
        return res.json({ redirect_url: redirectUrl.toString() });
      }
    }

    // Get client
    const client = await oauth2Service.getClient(client_id);
    if (!client) {
      return res.status(400).json({ error: 'invalid_client' });
    }

    // Parse scopes
    const scopes = Array.isArray(scope) ? scope : (scope ? scope.split(' ') : ['openid', 'profile', 'email']);

    // Save user consent
    await oauth2Service.createUserConsent(req.user.id, client_id, scopes);

    // Generate authorization code
    const code = await oauth2Service.createAuthorizationCode({
      clientId: client.id,
      userId: req.user.id,
      redirectUri: redirect_uri,
      scopes,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || 'plain'
    });

    // Build redirect URL
    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.append('code', code);
    if (state) {
      redirectUrl.searchParams.append('state', state);
    }

    // Check if this is a browser request (from external OAuth client like Discourse)
    const acceptHeader = req.headers.accept || '';
    const isHtmlRequest = acceptHeader.includes('text/html') || acceptHeader.includes('*/*');

    if (isHtmlRequest) {
      // Do actual HTTP redirect for external OAuth clients like Discourse
      return res.redirect(redirectUrl.toString());
    } else {
      res.json({ redirect_url: redirectUrl.toString() });
    }
  } catch (error) {
    console.error('Authorization approval error:', error);
    res.status(500).json({ error: 'server_error', error_description: error.message });
  }
};

/**
 * POST /oauth/token
 * Token endpoint - exchanges code for access token
 */
const token = async (req, res) => {
  try {
    console.log('[OAuth] Token endpoint called with grant_type:', req.body.grant_type);

    // Extract client credentials from either POST body or HTTP Basic Auth
    let client_id = req.body.client_id;
    let client_secret = req.body.client_secret;

    // Check for HTTP Basic Authentication (client_secret_basic)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Basic ')) {
      const base64Credentials = authHeader.substring(6);
      const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8');
      const [basicClientId, basicClientSecret] = credentials.split(':');
      client_id = basicClientId || client_id;
      client_secret = basicClientSecret || client_secret;
    }

    console.log('[OAuth] Token request params:', {
      grant_type: req.body.grant_type,
      client_id: client_id,
      auth_method: authHeader ? 'basic' : 'post',
      has_code: !!req.body.code,
      has_redirect_uri: !!req.body.redirect_uri
    });

    const {
      grant_type,
      code,
      redirect_uri,
      refresh_token,
      code_verifier
    } = req.body;

    // Validate grant_type
    if (!grant_type || !['authorization_code', 'refresh_token'].includes(grant_type)) {
      console.error('[OAuth] Invalid grant_type:', grant_type);
      return res.status(400).json({ error: 'unsupported_grant_type' });
    }

    // Verify client credentials
    const client = await oauth2Service.verifyClientCredentials(client_id, client_secret);
    if (!client) {
      console.error('[OAuth] Client verification failed for:', client_id);
      return res.status(401).json({ error: 'invalid_client' });
    }
    console.log('[OAuth] Client verified:', client.name);

    if (grant_type === 'authorization_code') {
      // Validate required parameters
      if (!code || !redirect_uri) {
        console.error('[OAuth] Missing code or redirect_uri');
        return res.status(400).json({ error: 'invalid_request' });
      }

      console.log('[OAuth] Verifying authorization code...');
      // Verify authorization code
      const authCode = await oauth2Service.verifyAuthorizationCode(
        code,
        client_id,
        redirect_uri,
        code_verifier
      );
      console.log('[OAuth] Authorization code verified for user:', authCode.user_id);

      console.log('[OAuth] Creating access token...');
      // Create access token
      const accessToken = await oauth2Service.createAccessToken({
        clientId: client.id,
        userId: authCode.user_id,
        scopes: authCode.scopes
      });
      console.log('[OAuth] Access token created');

      console.log('[OAuth] Creating refresh token...');
      // Create refresh token
      const refreshToken = await oauth2Service.createRefreshToken({
        accessTokenId: accessToken.token_id,
        clientId: client.id,
        userId: authCode.user_id,
        scopes: authCode.scopes
      });
      console.log('[OAuth] Refresh token created');

      // Generate ID token (JWT) for OpenID Connect
      const jwt = require('jsonwebtoken');
      const User = require('../models/User');
      const user = await User.findById(authCode.user_id);

      // Determine protocol (same logic as openidConfiguration)
      const host = req.get('host');
      let protocol = req.get('x-forwarded-proto') || req.protocol;
      if (host && !host.includes('localhost') && !host.includes('127.0.0.1') && protocol === 'http') {
        protocol = 'https';
      }

      const idTokenPayload = {
        iss: `${protocol}://${host}`,
        sub: user.id,
        aud: client_id,
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour
        iat: Math.floor(Date.now() / 1000),
        email: user.email,
        email_verified: user.is_verified || false,
        name: user.full_name || user.username,
        preferred_username: user.username
      };

      // Add nonce if it was in the authorization request (required for OIDC)
      if (authCode.nonce) {
        idTokenPayload.nonce = authCode.nonce;
        console.log('[OAuth] Added nonce to ID token');
      }

      // Sign ID token with RS256 using RSA private key
      const privateKey = getOAuthPrivateKey();

      const idToken = jwt.sign(idTokenPayload, privateKey, { algorithm: 'RS256' });
      console.log('[OAuth] ID token created with RS256');

      const tokenResponse = {
        access_token: accessToken.access_token,
        token_type: accessToken.token_type,
        expires_in: accessToken.expires_in,
        refresh_token: refreshToken,
        id_token: idToken,
        scope: accessToken.scope
      };

      console.log('[OAuth] Sending token response to client:', {
        has_access_token: !!tokenResponse.access_token,
        has_id_token: !!tokenResponse.id_token,
        has_refresh_token: !!tokenResponse.refresh_token
      });

      return res.json(tokenResponse);
    } else if (grant_type === 'refresh_token') {
      // Validate required parameters
      if (!refresh_token) {
        return res.status(400).json({ error: 'invalid_request' });
      }

      // Refresh access token
      const newAccessToken = await oauth2Service.refreshAccessToken(refresh_token, client_id);

      return res.json({
        access_token: newAccessToken.access_token,
        token_type: newAccessToken.token_type,
        expires_in: newAccessToken.expires_in,
        scope: newAccessToken.scope
      });
    }
  } catch (error) {
    console.error('Token error:', error.message);
    return res.status(400).json({ error: 'invalid_grant', error_description: error.message });
  }
};

/**
 * GET /oauth/userinfo
 * User info endpoint - returns user profile data
 */
const userinfo = async (req, res) => {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    const token = authHeader.substring(7);

    // Verify access token
    const tokenData = await oauth2Service.verifyAccessToken(token);
    if (!tokenData) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    // Get user data
    const user = await User.findById(tokenData.user_id);
    if (!user) {
      return res.status(404).json({ error: 'user_not_found' });
    }

    // Build response based on scopes
    const response = {};
    const scopes = tokenData.scopes || [];

    if (scopes.includes('openid') || scopes.includes('profile')) {
      response.sub = user.id;
      response.preferred_username = user.username;
    }

    if (scopes.includes('profile')) {
      response.name = user.full_name || user.username;
      response.username = user.username;
      response.updated_at = user.updated_at;
    }

    if (scopes.includes('email')) {
      response.email = user.email;
      response.email_verified = user.is_verified;
    }

    // Additional custom claims
    response.role = user.role;
    response.tier = user.tier;
    response.avatar_url = user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.username)}&size=200`;

    res.json(response);
  } catch (error) {
    console.error('Userinfo error:', error);
    res.status(500).json({ error: 'server_error' });
  }
};

/**
 * POST /oauth/revoke
 * Revoke token endpoint
 */
const revoke = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ error: 'invalid_request' });
    }

    await oauth2Service.revokeToken(token);

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Revoke error:', error);
    res.status(500).json({ error: 'server_error' });
  }
};

/**
 * GET /api/oauth/clients
 * List OAuth2 clients (admin or owned)
 */
const listClients = async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const createdBy = isAdmin ? null : req.user.id;

    const clients = await oauth2Service.listClients(createdBy);

    // Remove sensitive data
    const sanitizedClients = clients.map(client => ({
      id: client.id,
      client_id: client.client_id,
      name: client.name,
      description: client.description,
      redirect_uris: client.redirect_uris,
      allowed_scopes: client.allowed_scopes,
      logo_url: client.logo_url,
      website_url: client.website_url,
      is_trusted: client.is_trusted,
      created_at: client.created_at,
      updated_at: client.updated_at
    }));

    res.json({ clients: sanitizedClients });
  } catch (error) {
    console.error('List clients error:', error);
    res.status(500).json({ error: 'Failed to list OAuth clients' });
  }
};

/**
 * POST /api/oauth/clients
 * Register new OAuth2 client
 */
const registerClient = async (req, res) => {
  try {
    const { name, description, redirectUris, allowedScopes, logoUrl, websiteUrl, isTrusted } = req.body;

    // Validate required fields
    if (!name || !redirectUris || !Array.isArray(redirectUris) || redirectUris.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: name and redirectUris' });
    }

    // Only admins can create trusted clients
    if (isTrusted && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can create trusted clients' });
    }

    const client = await oauth2Service.registerClient({
      name,
      description,
      redirectUris,
      allowedScopes,
      logoUrl,
      websiteUrl,
      isTrusted: isTrusted && req.user.role === 'admin'
    }, req.user.id);

    res.status(201).json({
      client: {
        client_id: client.client_id,
        client_secret: client.client_secret, // Only returned on creation
        name: client.name,
        description: client.description,
        redirect_uris: client.redirect_uris,
        allowed_scopes: client.allowed_scopes,
        created_at: client.created_at
      },
      message: 'OAuth2 client registered successfully. Save the client_secret - it will not be shown again.'
    });
  } catch (error) {
    console.error('Register client error:', error);
    res.status(500).json({ error: 'Failed to register OAuth client' });
  }
};

/**
 * DELETE /api/oauth/clients/:clientId
 * Delete OAuth2 client
 */
const deleteClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    const deletedClient = await oauth2Service.deleteClient(clientId, req.user.id);

    if (!deletedClient) {
      return res.status(404).json({ error: 'Client not found or access denied' });
    }

    res.json({ message: 'OAuth client deleted successfully' });
  } catch (error) {
    console.error('Delete client error:', error);
    res.status(500).json({ error: 'Failed to delete OAuth client' });
  }
};

/**
 * GET /api/oauth/authorized-clients
 * Get user's authorized OAuth clients
 */
const getAuthorizedClients = async (req, res) => {
  try {
    const clients = await oauth2Service.getUserAuthorizedClients(req.user.id);

    res.json({ clients });
  } catch (error) {
    console.error('Get authorized clients error:', error);
    res.status(500).json({ error: 'Failed to get authorized clients' });
  }
};

/**
 * DELETE /api/oauth/authorized-clients/:clientId
 * Revoke authorization for a client
 */
const revokeAuthorization = async (req, res) => {
  try {
    const { clientId } = req.params;

    const revoked = await oauth2Service.revokeUserConsent(req.user.id, clientId);

    if (!revoked) {
      return res.status(404).json({ error: 'Authorization not found' });
    }

    res.json({ message: 'Authorization revoked successfully' });
  } catch (error) {
    console.error('Revoke authorization error:', error);
    res.status(500).json({ error: 'Failed to revoke authorization' });
  }
};

/**
 * GET /.well-known/openid-configuration
 * OpenID Connect Discovery endpoint
 */
const openidConfiguration = async (req, res) => {
  try {
    // Determine protocol: use X-Forwarded-Proto if available,
    // or assume https for external domains, otherwise use req.protocol
    const host = req.get('host');
    let protocol = req.get('x-forwarded-proto') || req.protocol;

    // If accessing via a domain name (not localhost), assume https
    // Allow HTTP for Docker gateway IP (172.27.0.1) used by Discourse container
    if (host && !host.includes('localhost') && !host.includes('127.0.0.1') && !host.includes('172.27.0.1') && protocol === 'http') {
      protocol = 'https';
    }

    const baseUrl = `${protocol}://${host}`;

    const config = {
      issuer: baseUrl,
      authorization_endpoint: `${baseUrl}/oauth/authorize`,
      token_endpoint: `${baseUrl}/oauth/token`,
      userinfo_endpoint: `${baseUrl}/oauth/userinfo`,
      revocation_endpoint: `${baseUrl}/oauth/revoke`,
      jwks_uri: `${baseUrl}/.well-known/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      claims_supported: [
        'sub',
        'name',
        'preferred_username',
        'email',
        'email_verified',
        'updated_at',
        'username',
        'role',
        'tier',
        'avatar_url'
      ],
      code_challenge_methods_supported: ['plain', 'S256']
    };

    res.json(config);
  } catch (error) {
    console.error('OpenID configuration error:', error);
    res.status(500).json({ error: 'server_error' });
  }
};

/**
 * GET /.well-known/jwks.json
 * JWKS endpoint - returns public keys for JWT verification
 */
const jwks = async (req, res) => {
  try {
    const crypto = require('crypto');

    const publicKeyPem = getOAuthPublicKey();

    // Convert PEM to JWK format
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const jwk = publicKey.export({ format: 'jwk' });

    // Add required JWK fields
    jwk.use = 'sig';
    jwk.alg = 'RS256';
    jwk.kid = 'oauth-rsa-key-1';

    res.json({
      keys: [jwk]
    });
  } catch (error) {
    console.error('JWKS error:', error);
    res.status(500).json({ error: 'server_error' });
  }
};




module.exports = {
  authorize,
  authorizeApprove,
  token,
  userinfo,
  revoke,
  listClients,
  registerClient,
  deleteClient,
  getAuthorizedClients,
  revokeAuthorization,
  openidConfiguration,
  jwks
};
