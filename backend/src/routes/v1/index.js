const express = require('express');
const router = express.Router();

// Import v1 route modules
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const tradeRoutes = require('./trade.routes');
const analyticsRoutes = require('./analytics.routes');
const settingsRoutes = require('./settings.routes');
const deviceRoutes = require('./device.routes');
const syncRoutes = require('./sync.routes');
const serverRoutes = require('./server.routes');

// API versioning middleware
router.use((req, res, next) => {
  // Add API version header to all responses
  res.setHeader('X-API-Version', 'v1');
  
  // Track API version usage (for analytics)
  req.apiVersion = 'v1';
  
  next();
});

// Mount v1 routes
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/trades', tradeRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/settings', settingsRoutes);
router.use('/devices', deviceRoutes);
router.use('/sync', syncRoutes);
router.use('/server', serverRoutes);

// V1 API health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    version: 'v1',
    timestamp: new Date().toISOString(),
    features: {
      mobile_sync: true,
      device_management: true,
      refresh_tokens: true,
      offline_support: true
    }
  });
});

module.exports = router;