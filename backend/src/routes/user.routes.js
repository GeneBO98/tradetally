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
router.post('/onboarding-completed', authenticate, userController.markOnboardingCompleted);
router.get('/onboarding-status', authenticate, userController.getOnboardingStatus);

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

/**
 * @swagger
 * /api/users/quality-weights:
 *   get:
 *     summary: Get user's quality grading weight preferences
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's quality weight preferences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 qualityWeights:
 *                   type: object
 *                   properties:
 *                     news:
 *                       type: integer
 *                       description: News sentiment weight percentage (0-100)
 *                     gap:
 *                       type: integer
 *                       description: Gap from previous close weight percentage (0-100)
 *                     relativeVolume:
 *                       type: integer
 *                       description: Relative volume weight percentage (0-100)
 *                     float:
 *                       type: integer
 *                       description: Float/shares outstanding weight percentage (0-100)
 *                     priceRange:
 *                       type: integer
 *                       description: Price range weight percentage (0-100)
 *   put:
 *     summary: Update user's quality grading weight preferences
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [news, gap, relativeVolume, float, priceRange]
 *             properties:
 *               news:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 description: News sentiment weight percentage
 *               gap:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Gap from previous close weight percentage
 *               relativeVolume:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Relative volume weight percentage
 *               float:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Float/shares outstanding weight percentage
 *               priceRange:
 *                 type: integer
 *                 minimum: 0
 *                 maximum: 100
 *                 description: Price range weight percentage
 *     responses:
 *       200:
 *         description: Quality weights updated successfully
 *       400:
 *         description: Invalid weights (must sum to 100)
 */
router.get('/quality-weights', authenticate, userController.getQualityWeights);
router.put('/quality-weights', authenticate, userController.updateQualityWeights);

/**
 * @swagger
 * /api/users/api-usage:
 *   get:
 *     summary: Get API usage statistics for current user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API usage statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     tier:
 *                       type: string
 *                       enum: [free, pro]
 *                     billingEnabled:
 *                       type: boolean
 *                     unlimited:
 *                       type: boolean
 *                     endpoints:
 *                       type: object
 *                       properties:
 *                         quote:
 *                           type: object
 *                           properties:
 *                             limit:
 *                               oneOf:
 *                                 - type: integer
 *                                 - type: string
 *                             used:
 *                               type: integer
 *                             remaining:
 *                               oneOf:
 *                                 - type: integer
 *                                 - type: string
 *                             resetAt:
 *                               type: string
 *                               format: date-time
 */
router.get('/api-usage', authenticate, userController.getApiUsage);

/**
 * @swagger
 * /api/users/account:
 *   delete:
 *     summary: Delete own account
 *     description: Permanently delete the authenticated user's account. Requires password confirmation.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 description: Current password to confirm deletion
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *       400:
 *         description: Cannot delete last admin account
 *       401:
 *         description: Incorrect password
 */
router.delete('/account', authenticate, userController.deleteOwnAccount);

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