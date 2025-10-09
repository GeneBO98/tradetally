const express = require('express');
const router = express.Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
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
router.post('/authorize', authenticate, oauth2Controller.authorizeApprove);

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
// These require authentication and are used by TradeTally admins/users

/**
 * GET /api/oauth/clients
 * List OAuth2 clients (user's own or all if admin)
 * Requires: Authentication
 */
router.get('/api/clients', authenticate, oauth2Controller.listClients);

/**
 * POST /api/oauth/clients
 * Register a new OAuth2 client
 * Requires: Authentication
 * Body: name, description, redirectUris, allowedScopes, logoUrl, websiteUrl, isTrusted
 */
router.post('/api/clients', authenticate, oauth2Controller.registerClient);

/**
 * DELETE /api/oauth/clients/:clientId
 * Delete an OAuth2 client
 * Requires: Authentication (must be owner or admin)
 */
router.delete('/api/clients/:clientId', authenticate, oauth2Controller.deleteClient);

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
