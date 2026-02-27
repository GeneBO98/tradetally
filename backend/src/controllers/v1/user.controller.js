const User = require('../../models/User');
const db = require('../../config/database');
const userController = require('../user.controller');
const settingsController = require('../settings.controller');
const { captureControllerResult } = require('../../utils/legacyControllerAdapter');
const { sendV1ErrorFromLegacy, sendV1NotImplemented } = require('../../utils/apiResponse');

function toCamelCaseRecord(record = {}) {
  const converted = {};

  Object.entries(record || {}).forEach(([key, value]) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    converted[camelKey] = value;
  });

  return converted;
}

const userV1Controller = {
  async getProfile(req, res, next) {
    try {
      const user = await User.findById(req.user.id);
      const rawSettings = await User.getSettings(req.user.id);
      const settings = toCamelCaseRecord(rawSettings || {});

      res.json({
        profile: {
          id: user.id,
          email: user.email,
          username: user.username,
          fullName: user.full_name,
          avatarUrl: user.avatar_url,
          role: user.role,
          isVerified: user.is_verified,
          timezone: user.timezone,
          createdAt: user.created_at,
          lastLoginAt: user.updated_at
        },
        settings,
        mobile: {
          lastSyncAt: null,
          syncEnabled: false,
          notificationsEnabled: settings.emailNotifications || false
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async updateProfile(req, res, next) {
    try {
      const legacyResult = await captureControllerResult(userController.updateProfile, req);

      if (legacyResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, legacyResult, 'Failed to update profile');
      }

      return res.status(legacyResult.statusCode || 200).json({
        profile: legacyResult.body?.user || null,
        message: legacyResult.body?.message
      });
    } catch (error) {
      next(error);
    }
  },

  async uploadAvatar(req, res, next) {
    try {
      const legacyResult = await captureControllerResult(userController.uploadAvatar, req);

      if (legacyResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, legacyResult, 'Failed to upload avatar');
      }

      return res.status(legacyResult.statusCode || 200).json({
        profile: legacyResult.body?.user || null
      });
    } catch (error) {
      next(error);
    }
  },

  async deleteAvatar(req, res, next) {
    try {
      const legacyResult = await captureControllerResult(userController.deleteAvatar, req);

      if (legacyResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, legacyResult, 'Failed to delete avatar');
      }

      return res.status(legacyResult.statusCode || 200).json({
        deleted: true,
        profile: legacyResult.body?.user || null
      });
    } catch (error) {
      next(error);
    }
  },

  async getPreferences(req, res, next) {
    try {
      const rawSettings = await User.getSettings(req.user.id);
      const settings = toCamelCaseRecord(rawSettings || {});

      res.json({
        preferences: {
          theme: settings.theme || 'light',
          timezone: req.user.timezone || 'UTC',
          emailNotifications: settings.emailNotifications || false,
          publicProfile: settings.publicProfile || false,
          defaultTags: settings.defaultTags || []
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async updatePreferences(req, res, next) {
    try {
      const { theme, timezone, emailNotifications, publicProfile, defaultTags } = req.body || {};

      if (timezone !== undefined) {
        const profileResult = await captureControllerResult(userController.updateProfile, {
          ...req,
          body: { timezone }
        });

        if (profileResult.statusCode >= 400) {
          return sendV1ErrorFromLegacy(res, profileResult, 'Failed to update preferences');
        }
      }

      const settingsPayload = {};
      if (theme !== undefined) settingsPayload.theme = theme;
      if (emailNotifications !== undefined) settingsPayload.emailNotifications = emailNotifications;
      if (publicProfile !== undefined) settingsPayload.publicProfile = publicProfile;
      if (defaultTags !== undefined) settingsPayload.defaultTags = defaultTags;

      let updatedSettings = {};
      if (Object.keys(settingsPayload).length > 0) {
        const settingsResult = await captureControllerResult(settingsController.updateSettings, {
          ...req,
          body: settingsPayload
        });

        if (settingsResult.statusCode >= 400) {
          return sendV1ErrorFromLegacy(res, settingsResult, 'Failed to update preferences');
        }

        updatedSettings = settingsResult.body?.settings || {};
      }

      const currentUser = await User.findById(req.user.id);

      return res.json({
        updated: true,
        preferences: {
          theme: updatedSettings.theme || theme || 'light',
          timezone: currentUser.timezone || timezone || 'UTC',
          emailNotifications: updatedSettings.emailNotifications ?? emailNotifications ?? false,
          publicProfile: updatedSettings.publicProfile ?? publicProfile ?? false,
          defaultTags: updatedSettings.defaultTags ?? defaultTags ?? []
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getSyncInfo(req, res, next) {
    try {
      const result = await db.query('SELECT COUNT(*)::integer AS count FROM devices WHERE user_id = $1', [req.user.id]);
      const deviceCount = result.rows[0]?.count || 0;

      res.json({
        sync: {
          lastSyncAt: null,
          syncVersion: 0,
          pendingChanges: 0,
          conflictsCount: 0,
          deviceCount,
          enabled: false
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async updateSyncInfo(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Sync info updates are not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  }
};

module.exports = userV1Controller;
