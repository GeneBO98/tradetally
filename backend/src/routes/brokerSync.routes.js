/**
 * Broker Sync Routes
 * API endpoints for managing broker connections and syncing trades
 */

const express = require('express');
const router = express.Router();
const brokerSyncController = require('../controllers/brokerSync.controller');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { createRateLimiter } = require('../utils/rateLimit');

const brokerSyncLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many broker sync requests. Please try again later.'
});

// All routes require authentication (except OAuth callback)
router.use((req, res, next) => {
  // Skip auth for OAuth callback route
  if (req.path === '/connections/schwab/callback' || /^\/connections\/[^/]+\/callback$/.test(req.path)) {
    return next();
  }
  return authenticate(req, res, next);
});

// Get all broker connections for current user
router.get('/connections', brokerSyncController.getConnections);

// Get all sync logs for current user
router.get('/logs', brokerSyncController.getAllSyncLogs);

// Get a specific connection
router.get('/connections/:id', brokerSyncController.getConnection);

// Get sync logs for a specific connection
router.get('/connections/:id/logs', brokerSyncController.getSyncLogs);

// Add IBKR connection
router.post('/connections/ibkr', brokerSyncLimiter, validate(schemas.brokerSyncIbkrConnection), brokerSyncController.addIBKRConnection);

// Add Trading 212 API-key connection
router.post('/connections/trading212', brokerSyncLimiter, validate(schemas.brokerSyncTrading212Connection), brokerSyncController.addTrading212Connection);

// Initialize Schwab OAuth flow
router.post('/connections/schwab/init', brokerSyncLimiter, brokerSyncController.initSchwabOAuth);

// Handle Schwab OAuth callback (no auth required - user redirected from Schwab)
router.get('/connections/schwab/callback', brokerSyncController.handleSchwabCallback);

// Initialize direct broker OAuth flow
router.post('/connections/:broker/init', brokerSyncController.initBrokerOAuth);

// Handle direct broker OAuth callback (no auth required - user redirected from broker)
router.get('/connections/:broker/callback', brokerSyncController.handleBrokerOAuthCallback);

// Update connection settings
router.put('/connections/:id', brokerSyncLimiter, validate(schemas.brokerSyncConnectionUpdate), brokerSyncController.updateConnection);

// Delete connection
router.delete('/connections/:id', brokerSyncController.deleteConnection);

// Trigger manual sync
router.post('/connections/:id/sync', brokerSyncLimiter, validate(schemas.brokerSyncManualSync), brokerSyncController.triggerSync);

// Test connection
router.post('/connections/:id/test', brokerSyncLimiter, brokerSyncController.testConnection);

// Delete all trades from a broker connection
router.delete('/connections/:id/trades', brokerSyncController.deleteBrokerTrades);

// Get sync status
router.get('/sync/:syncId/status', brokerSyncController.getSyncStatus);

module.exports = router;
