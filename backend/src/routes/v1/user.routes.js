const express = require('express');
const router = express.Router();
const userController = require('../../controllers/user.controller');
const userV1Controller = require('../../controllers/v1/user.controller');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validation');

// Enhanced user management for mobile
router.get('/profile', authenticate, userV1Controller.getProfile);
router.put('/profile', authenticate, validate(schemas.updateProfile), userV1Controller.updateProfile);
router.post('/profile/avatar', authenticate, userV1Controller.uploadAvatar);
router.delete('/profile/avatar', authenticate, userV1Controller.deleteAvatar);

// Password management
router.put('/password', authenticate, validate(schemas.changePassword), userController.changePassword);

// User preferences and settings
router.get('/preferences', authenticate, userV1Controller.getPreferences);
router.put('/preferences', authenticate, userV1Controller.updatePreferences);

// Mobile-specific user data
router.get('/sync-info', authenticate, userV1Controller.getSyncInfo);
router.post('/sync-info', authenticate, userV1Controller.updateSyncInfo);

// Admin routes (reuse existing)
router.get('/', authenticate, requireAdmin, userController.getUsers);
router.get('/:id', authenticate, requireAdmin, userController.getUserById);
router.put('/:id', authenticate, requireAdmin, userController.updateUser);
router.delete('/:id', authenticate, requireAdmin, userController.deleteUser);

module.exports = router;