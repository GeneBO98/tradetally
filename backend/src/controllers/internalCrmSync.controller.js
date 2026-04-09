const crmSyncScheduler = require('../services/crmSyncScheduler');

function getTargets(body = {}) {
  return Array.isArray(body.targets) && body.targets.length > 0
    ? body.targets
    : undefined;
}

function isUserNotFound(results = {}) {
  const attempted = Object.values(results).filter((entry) => entry && entry.enabled);
  return attempted.length > 0 && attempted.every((entry) => entry.found === false);
}

const internalCrmSyncController = {
  async getStatus(req, res, next) {
    try {
      return res.json({
        status: crmSyncScheduler.getStatus(),
      });
    } catch (error) {
      return next(error);
    }
  },

  async runFullSync(req, res, next) {
    try {
      const result = await crmSyncScheduler.syncAll({ targets: getTargets(req.body) });

      if (result?.skipped && result.reason === 'sync_in_progress') {
        return res.status(202).json({
          message: 'CRM sync already in progress; skipping duplicate request',
          code: 'CRM_SYNC_IN_PROGRESS',
          result,
        });
      }

      return res.json({
        message: 'CRM sync completed',
        result,
      });
    } catch (error) {
      return next(error);
    }
  },

  async syncUser(req, res, next) {
    try {
      const result = await crmSyncScheduler.syncUser(req.params.userId, { targets: getTargets(req.body) });

      if (isUserNotFound(result)) {
        return res.status(404).json({
          error: 'User not found for CRM sync',
          code: 'CRM_SYNC_USER_NOT_FOUND',
        });
      }

      return res.json({
        message: 'User CRM sync completed',
        result,
      });
    } catch (error) {
      return next(error);
    }
  },

  async syncUserRevenue(req, res, next) {
    try {
      const billingService = require('../services/billingService');
      const result = await billingService.backfillInvoiceNinjaRevenue(req.params.userId);

      return res.json({
        message: 'User Invoice Ninja revenue sync completed',
        result,
      });
    } catch (error) {
      return next(error);
    }
  },
};

module.exports = internalCrmSyncController;
