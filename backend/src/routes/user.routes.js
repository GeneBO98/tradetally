const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const multer = require('multer');

const upload = multer({
  limits: { fileSize: 5242880 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(file.originalname.toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type'));
  }
});

router.get('/profile', authenticate, userController.getProfile);
router.put('/profile', authenticate, userController.updateProfile);
router.post('/avatar', authenticate, upload.single('avatar'), userController.uploadAvatar);
router.delete('/avatar', authenticate, userController.deleteAvatar);
router.put('/password', authenticate, userController.changePassword);

// Admin-only user management routes
router.get('/admin/users', requireAdmin, userController.getAllUsers);
router.get('/admin/users/pending', requireAdmin, userController.getPendingUsers);
router.post('/admin/users/:userId/approve', requireAdmin, userController.approveUser);
router.post('/admin/users/:userId/verify', requireAdmin, userController.verifyUser);
router.put('/admin/users/:userId/role', requireAdmin, userController.updateUserRole);
router.put('/admin/users/:userId/status', requireAdmin, userController.toggleUserStatus);
router.delete('/admin/users/:userId', requireAdmin, userController.deleteUser);

// Tier management routes
router.get('/admin/tier-stats', requireAdmin, userController.getTierStats);
router.get('/admin/users/:userId/tier', requireAdmin, userController.getUserTier);
router.put('/admin/users/:userId/tier', requireAdmin, userController.updateUserTier);
router.post('/admin/users/:userId/tier-override', requireAdmin, userController.setTierOverride);
router.delete('/admin/users/:userId/tier-override', requireAdmin, userController.removeTierOverride);
router.get('/admin/users/:userId/tier-override', requireAdmin, userController.getTierOverride);

// Public profile routes (must be last to avoid conflicts)
router.get('/:username', userController.getPublicProfile);
router.get('/:username/trades', userController.getUserPublicTrades);

module.exports = router;