const express = require('express');
const router = express.Router();
const equityController = require('../controllers/equity.controller');
const { authenticate } = require('../middleware/auth');

// All equity routes require authentication
router.use(authenticate);

// Get equity snapshots
router.get('/snapshots', equityController.getEquitySnapshots);

// Create equity snapshot
router.post('/snapshots', equityController.createEquitySnapshot);

// Update equity snapshot
router.put('/snapshots/:id', equityController.updateEquitySnapshot);

// Delete equity snapshot
router.delete('/snapshots/:id', equityController.deleteEquitySnapshot);

// Update current account equity
router.put('/current', equityController.updateCurrentEquity);

// Calculate K Ratio
router.get('/k-ratio', equityController.calculateKRatio);

module.exports = router;