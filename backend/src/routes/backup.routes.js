const express = require('express');
const router = express.Router();
const multer = require('multer');
const backupController = require('../controllers/backup.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Configure multer for backup file upload (in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB limit for backup files
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/json' || file.originalname.endsWith('.json')) {
      cb(null, true);
    } else {
      cb(new Error('Only JSON backup files are allowed'), false);
    }
  }
});

/**
 * Backup Routes (Admin Only)
 * All endpoints require admin authentication
 *
 * NOTE: Specific routes (settings, cleanup, restore) must come before parameterized routes (:id)
 * to avoid route conflicts
 */

// Get backup settings (must come before /:id routes)
router.get('/settings', authenticate, requireAdmin, backupController.getSettings);

// Update backup settings
router.put('/settings', authenticate, requireAdmin, backupController.updateSettings);

// Cleanup old backups
router.post('/cleanup', authenticate, requireAdmin, backupController.cleanupOldBackups);

// Restore from backup file
router.post('/restore', authenticate, requireAdmin, upload.single('file'), backupController.restoreBackup);

// Create a manual backup
router.post('/', authenticate, requireAdmin, backupController.createBackup);

// Get all backups
router.get('/', authenticate, requireAdmin, backupController.getBackups);

// Download a backup file
router.get('/:id/download', authenticate, requireAdmin, backupController.downloadBackup);

// Delete a backup
router.delete('/:id', authenticate, requireAdmin, backupController.deleteBackup);

module.exports = router;
