const express = require('express');
const router = express.Router();
const backupController = require('../controllers/backup.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

/**
 * Backup Routes (Admin Only)
 * All endpoints require admin authentication
 *
 * NOTE: Specific routes (settings, cleanup) must come before parameterized routes (:id)
 * to avoid route conflicts
 */

// Get backup settings (must come before /:id routes)
router.get('/settings', authenticate, requireAdmin, backupController.getSettings);

// Update backup settings
router.put('/settings', authenticate, requireAdmin, backupController.updateSettings);

// Cleanup old backups
router.post('/cleanup', authenticate, requireAdmin, backupController.cleanupOldBackups);

// Create a manual backup
router.post('/', authenticate, requireAdmin, backupController.createBackup);

// Get all backups
router.get('/', authenticate, requireAdmin, backupController.getBackups);

// Download a backup file
router.get('/:id/download', authenticate, requireAdmin, backupController.downloadBackup);

// Delete a backup
router.delete('/:id', authenticate, requireAdmin, backupController.deleteBackup);

module.exports = router;
