const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const multer = require('multer');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User profile and account management
 */

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

/**
 * @swagger
 * /api/users/profile:
 *   get:
 *     summary: Get user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *   put:
 *     summary: Update user profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.get('/profile', authenticate, userController.getProfile);
router.put('/profile', authenticate, userController.updateProfile);

/**
 * @swagger
 * /api/users/avatar:
 *   post:
 *     summary: Upload user avatar
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               avatar:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Avatar uploaded successfully
 *   delete:
 *     summary: Delete user avatar
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Avatar deleted successfully
 */
router.post('/avatar', authenticate, upload.single('avatar'), userController.uploadAvatar);
router.delete('/avatar', authenticate, userController.deleteAvatar);

/**
 * @swagger
 * /api/users/password:
 *   put:
 *     summary: Change user password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentPassword, newPassword]
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password changed successfully
 */
router.put('/password', authenticate, userController.changePassword);

// Admin-only user management routes
router.get('/admin/users', requireAdmin, userController.getAllUsers);
router.get('/admin/statistics', requireAdmin, userController.getStatistics);
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

// Trade enrichment route
router.post('/enrich-trades', authenticate, userController.enrichTrades);

// Public profile routes (must be last to avoid conflicts)
router.get('/:username', userController.getPublicProfile);
router.get('/:username/trades', userController.getUserPublicTrades);

module.exports = router;