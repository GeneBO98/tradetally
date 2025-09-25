const TierService = require('../services/tierService');

const featuresController = {
  async getAllFeatures(req, res, next) {
    try {
      const features = await TierService.getAllFeatures();
      res.json({ features });
    } catch (error) {
      next(error);
    }
  },

  async createFeature(req, res, next) {
    try {
      const { featureKey, featureName, description, requiredTier } = req.body;

      if (!featureKey || !featureName || !requiredTier) {
        return res.status(400).json({ 
          error: 'Missing required fields: featureKey, featureName, and requiredTier are required' 
        });
      }

      if (!['free', 'pro'].includes(requiredTier)) {
        return res.status(400).json({ error: 'Invalid tier. Must be "free" or "pro"' });
      }

      const feature = await TierService.upsertFeature({
        featureKey,
        featureName,
        description,
        requiredTier
      });

      res.json({ feature, message: 'Feature created successfully' });
    } catch (error) {
      next(error);
    }
  },

  async updateFeature(req, res, next) {
    try {
      const { featureKey } = req.params;
      const { featureName, description, requiredTier, isActive } = req.body;

      const featureData = { featureKey };
      if (featureName !== undefined) featureData.featureName = featureName;
      if (description !== undefined) featureData.description = description;
      if (requiredTier !== undefined) {
        if (!['free', 'pro'].includes(requiredTier)) {
          return res.status(400).json({ error: 'Invalid tier. Must be "free" or "pro"' });
        }
        featureData.requiredTier = requiredTier;
      }
      if (isActive !== undefined) featureData.isActive = isActive;

      const feature = await TierService.upsertFeature(featureData);
      res.json({ feature, message: 'Feature updated successfully' });
    } catch (error) {
      next(error);
    }
  },

  async toggleFeature(req, res, next) {
    try {
      const { featureKey } = req.params;
      const { isActive } = req.body;

      if (typeof isActive !== 'boolean') {
        return res.status(400).json({ error: 'isActive must be a boolean value' });
      }

      const feature = await TierService.toggleFeature(featureKey, isActive);
      if (!feature) {
        return res.status(404).json({ error: 'Feature not found' });
      }

      res.json({ 
        feature, 
        message: `Feature ${isActive ? 'enabled' : 'disabled'} successfully` 
      });
    } catch (error) {
      next(error);
    }
  },

  async checkFeatureAccess(req, res, next) {
    try {
      const { featureKey } = req.params;
      const userId = req.user.id;

      const hasAccess = await TierService.hasFeatureAccess(userId, featureKey);
      const userTier = await TierService.getUserTier(userId);

      res.json({ 
        hasAccess,
        userTier,
        featureKey
      });
    } catch (error) {
      next(error);
    }
  }
};

module.exports = featuresController;