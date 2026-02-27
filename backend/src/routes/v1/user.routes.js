const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const userController = require('../../controllers/user.controller');
const userV1Controller = require('../../controllers/v1/user.controller');
const { authenticate, requireAdmin } = require('../../middleware/auth');
const { validate, schemas } = require('../../middleware/validation');

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadsDir = path.join(process.cwd(), 'uploads', 'avatars');
      fs.mkdirSync(uploadsDir, { recursive: true });
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const extension = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${extension}`);
    }
  }),
  limits: { fileSize: 5242880 },
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

// Enhanced user management for mobile
router.get('/profile', authenticate, userV1Controller.getProfile);
router.put('/profile', authenticate, validate(schemas.updateProfile), userV1Controller.updateProfile);
router.post('/profile/avatar', authenticate, avatarUpload.single('avatar'), userV1Controller.uploadAvatar);
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
router.get('/', authenticate, requireAdmin, userController.getAllUsers);
router.put('/:userId/role', authenticate, requireAdmin, userController.updateUserRole);
router.put('/:userId/status', authenticate, requireAdmin, userController.toggleUserStatus);
router.delete('/:userId', authenticate, requireAdmin, userController.deleteUser);

module.exports = router;
