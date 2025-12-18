/**
 * Broker Sync Routes
 * API endpoints for managing broker connections and syncing trades
 */

const express = require('express');
const router = express.Router();
const brokerSyncController = require('../controllers/brokerSync.controller');
const { authenticate } = require('../middleware/auth');

// All routes require authentication (except OAuth callback)
router.use((req, res, next) => {
  // Skip auth for OAuth callback route
  if (req.path === '/connections/schwab/callback') {
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
router.post('/connections/ibkr', brokerSyncController.addIBKRConnection);

// Initialize Schwab OAuth flow
router.post('/connections/schwab/init', brokerSyncController.initSchwabOAuth);

// Handle Schwab OAuth callback (no auth required - user redirected from Schwab)
router.get('/connections/schwab/callback', brokerSyncController.handleSchwabCallback);

// Update connection settings
router.put('/connections/:id', brokerSyncController.updateConnection);

// Delete connection
router.delete('/connections/:id', brokerSyncController.deleteConnection);

// Trigger manual sync
router.post('/connections/:id/sync', brokerSyncController.triggerSync);

// Test connection
router.post('/connections/:id/test', brokerSyncController.testConnection);

// Get sync status
router.get('/sync/:syncId/status', brokerSyncController.getSyncStatus);

module.exports = router;
