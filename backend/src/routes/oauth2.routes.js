const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth, requireAdmin } = require('../middleware/auth');
const { requireCsrf } = require('../middleware/csrf');
const oauth2Controller = require('../controllers/oauth2.controller');

// Public OAuth2 endpoints (standard OAuth2 spec)
// These endpoints follow OAuth2 RFC 6749 specification

/**
 * GET /oauth/authorize
 * Authorization endpoint - initiates OAuth2 flow
 * Query params: response_type, client_id, redirect_uri, scope, state, code_challenge, code_challenge_method
 */
router.get('/authorize', optionalAuth, oauth2Controller.authorize);

/**
 * POST /oauth/authorize
 * User consent endpoint - approves or denies authorization
 * Body: client_id, redirect_uri, scope, state, code_challenge, code_challenge_method, approved
 */
router.post('/authorize', requireCsrf, authenticate, oauth2Controller.authorizeApprove);

/**
 * POST /oauth/token
 * Token endpoint - exchanges code for access token
 * Body: grant_type, code, redirect_uri, client_id, client_secret, code_verifier (for authorization_code)
 * Body: grant_type, refresh_token, client_id, client_secret (for refresh_token)
 */
router.post('/token', oauth2Controller.token);

/**
 * GET /oauth/userinfo
 * UserInfo endpoint - returns user profile data
 * Requires: Bearer access token in Authorization header
 */
router.get('/userinfo', oauth2Controller.userinfo);

/**
 * GET /.well-known/openid-configuration
 * OpenID Connect Discovery endpoint
 * Returns OAuth2/OIDC metadata
 */
router.get('/.well-known/openid-configuration', oauth2Controller.openidConfiguration);

/**
 * POST /oauth/revoke
 * Token revocation endpoint
 * Body: token
 */
router.post('/revoke', oauth2Controller.revoke);

// Protected API endpoints for OAuth client management
// Application registration and management are restricted to administrators.

/**
 * GET /api/oauth/clients
 * List OAuth2 clients
 * Requires: Administrator
 */
router.get('/api/clients', requireAdmin, oauth2Controller.listClients);

/**
 * POST /api/oauth/clients
 * Register a new OAuth2 client
 * Requires: Administrator
 * Body: name, description, redirectUris, allowedScopes, logoUrl, websiteUrl, isTrusted
 */
router.post('/api/clients', requireAdmin, oauth2Controller.registerClient);

/**
 * DELETE /api/oauth/clients/:clientId
 * Delete an OAuth2 client
 * Requires: Administrator
 */
router.delete('/api/clients/:clientId', requireAdmin, oauth2Controller.deleteClient);

/**
 * GET /api/oauth/authorized-clients
 * Get list of OAuth clients the user has authorized
 * Requires: Authentication
 */
router.get('/api/authorized-clients', authenticate, oauth2Controller.getAuthorizedClients);

/**
 * DELETE /api/oauth/authorized-clients/:clientId
 * Revoke authorization for an OAuth client
 * Requires: Authentication
 */
router.delete('/api/authorized-clients/:clientId', authenticate, oauth2Controller.revokeAuthorization);

module.exports = router;
