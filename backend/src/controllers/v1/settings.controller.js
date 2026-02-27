const User = require('../../models/User');
const settingsController = require('../settings.controller');
const userController = require('../user.controller');
const { captureControllerResult } = require('../../utils/legacyControllerAdapter');
const { sendV1Error, sendV1ErrorFromLegacy, sendV1NotImplemented } = require('../../utils/apiResponse');

function toCamelCaseRecord(record = {}) {
  const converted = {};

  Object.entries(record || {}).forEach(([key, value]) => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    converted[camelKey] = value;
  });

  return converted;
}

async function getSettingsState(userId) {
  const settings = await User.getSettings(userId);
  return toCamelCaseRecord(settings || {});
}

const settingsV1Controller = {
  async getSettings(req, res, next) {
    try {
      const legacyResult = await captureControllerResult(settingsController.getSettings, req);

      if (legacyResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, legacyResult, 'Failed to load settings');
      }

      const settings = legacyResult.body?.settings || {};

      return res.json({
        settings: {
          ...settings,
          mobile: {
            syncEnabled: false,
            backgroundSync: false,
            notifications: settings.emailNotifications || false,
            biometric: false,
            theme: settings.theme || 'light'
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async updateSettings(req, res, next) {
    try {
      const legacyResult = await captureControllerResult(settingsController.updateSettings, req);

      if (legacyResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, legacyResult, 'Failed to update settings');
      }

      return res.status(legacyResult.statusCode || 200).json({
        settings: legacyResult.body?.settings || {},
        updated: true
      });
    } catch (error) {
      next(error);
    }
  },

  async getMobileSettings(req, res, next) {
    try {
      const settings = await getSettingsState(req.user.id);

      res.json({
        mobile: {
          syncEnabled: false,
          backgroundSync: false,
          syncInterval: null,
          offlineMode: false,
          biometricEnabled: false,
          notifications: {
            enabled: settings.emailNotifications || false,
            tradeClosed: false,
            dailySummary: false,
            weeklyReport: false
          },
          display: {
            theme: settings.theme || 'light',
            currency: 'USD',
            dateFormat: 'MM/DD/YYYY',
            timeFormat: '12h'
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async updateMobileSettings(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Mobile-only settings are read-only in the supported public API');
    } catch (error) {
      next(error);
    }
  },

  async getNotificationSettings(req, res, next) {
    try {
      const settings = await getSettingsState(req.user.id);

      res.json({
        notifications: {
          email: settings.emailNotifications || false,
          push: {
            enabled: false,
            tradeClosed: false,
            dailySummary: false,
            weeklyReport: false,
            marketOpen: false,
            marketClose: false
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async updateNotificationSettings(req, res, next) {
    try {
      const email = req.body?.email ?? req.body?.notifications?.email;

      if (email === undefined) {
        return sendV1Error(res, 400, 'BAD_REQUEST', 'notifications.email or email is required');
      }

      const legacyResult = await captureControllerResult(settingsController.updateSettings, {
        ...req,
        body: { emailNotifications: email }
      });

      if (legacyResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, legacyResult, 'Failed to update notification settings');
      }

      return res.json({
        updated: true,
        notifications: {
          email: legacyResult.body?.settings?.emailNotifications || false,
          push: {
            enabled: false,
            tradeClosed: false,
            dailySummary: false,
            weeklyReport: false,
            marketOpen: false,
            marketClose: false
          }
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getDisplaySettings(req, res, next) {
    try {
      const settings = await getSettingsState(req.user.id);

      res.json({
        display: {
          theme: settings.theme || 'light',
          currency: 'USD',
          timezone: req.user.timezone || 'UTC',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h',
          language: 'en'
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async updateDisplaySettings(req, res, next) {
    try {
      const theme = req.body?.theme ?? req.body?.display?.theme;
      const timezone = req.body?.timezone ?? req.body?.display?.timezone;

      if (theme === undefined && timezone === undefined) {
        return sendV1Error(res, 400, 'BAD_REQUEST', 'theme or timezone is required');
      }

      if (theme !== undefined) {
        const settingsResult = await captureControllerResult(settingsController.updateSettings, {
          ...req,
          body: { theme }
        });

        if (settingsResult.statusCode >= 400) {
          return sendV1ErrorFromLegacy(res, settingsResult, 'Failed to update display settings');
        }
      }

      if (timezone !== undefined) {
        const profileResult = await captureControllerResult(userController.updateProfile, {
          ...req,
          body: { timezone }
        });

        if (profileResult.statusCode >= 400) {
          return sendV1ErrorFromLegacy(res, profileResult, 'Failed to update display settings');
        }
      }

      const user = await User.findById(req.user.id);
      const settings = await getSettingsState(req.user.id);

      return res.json({
        updated: true,
        display: {
          theme: settings.theme || theme || 'light',
          currency: 'USD',
          timezone: user.timezone || timezone || 'UTC',
          dateFormat: 'MM/DD/YYYY',
          timeFormat: '12h',
          language: 'en'
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getPrivacySettings(req, res, next) {
    try {
      const settings = await getSettingsState(req.user.id);

      res.json({
        privacy: {
          publicProfile: settings.publicProfile || false,
          shareData: false,
          analytics: true,
          crashReports: true
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async updatePrivacySettings(req, res, next) {
    try {
      const publicProfile = req.body?.publicProfile ?? req.body?.privacy?.publicProfile;

      if (publicProfile === undefined) {
        return sendV1Error(res, 400, 'BAD_REQUEST', 'privacy.publicProfile or publicProfile is required');
      }

      const legacyResult = await captureControllerResult(settingsController.updateSettings, {
        ...req,
        body: { publicProfile }
      });

      if (legacyResult.statusCode >= 400) {
        return sendV1ErrorFromLegacy(res, legacyResult, 'Failed to update privacy settings');
      }

      return res.json({
        updated: true,
        privacy: {
          publicProfile: legacyResult.body?.settings?.publicProfile || false,
          shareData: false,
          analytics: true,
          crashReports: true
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async getDataSettings(req, res, next) {
    try {
      res.json({
        data: {
          autoBackup: true,
          backupFrequency: 'daily',
          retentionDays: 90,
          exportFormat: 'csv',
          includeNotes: true,
          includeTags: true
        }
      });
    } catch (error) {
      next(error);
    }
  },

  async updateDataSettings(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Data settings updates are not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  },

  async resetSettings(req, res, next) {
    try {
      return sendV1NotImplemented(res, 'Settings reset is not part of the supported public API yet');
    } catch (error) {
      next(error);
    }
  }
};

module.exports = settingsV1Controller;
