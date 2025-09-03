const TierService = require('../services/tierService');

// Middleware to check if user has required tier
const requiresTier = (requiredTier) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check if billing is disabled (for self-hosted instances)
      const billingEnabled = await TierService.isBillingEnabled();
      if (!billingEnabled) {
        // If billing is disabled, grant access to all tiers
        return next();
      }

      const userTier = await TierService.getUserTier(req.user.id);
      
      // If required tier is 'free', everyone has access
      if (requiredTier === 'free') {
        return next();
      }

      // If required tier is 'pro', check if user has pro tier
      if (requiredTier === 'pro' && userTier !== 'pro') {
        return res.status(403).json({ 
          error: 'Pro tier required',
          message: 'This feature requires a Pro subscription',
          currentTier: userTier,
          requiredTier: requiredTier
        });
      }

      next();
    } catch (error) {
      console.error('Tier check error:', error);
      res.status(500).json({ error: 'Failed to verify tier access' });
    }
  };
};

// Middleware to check if user has access to a specific feature
const requiresFeature = (featureKey) => {
  return async (req, res, next) => {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check if billing is disabled (for self-hosted instances)
      const billingEnabled = await TierService.isBillingEnabled();
      if (!billingEnabled) {
        // If billing is disabled, grant access to all features
        return next();
      }

      const hasAccess = await TierService.hasFeatureAccess(req.user.id, featureKey);
      
      if (!hasAccess) {
        const userTier = await TierService.getUserTier(req.user.id);
        return res.status(403).json({ 
          error: 'Feature not available',
          message: 'You do not have access to this feature',
          currentTier: userTier,
          featureKey: featureKey
        });
      }

      next();
    } catch (error) {
      console.error('Feature check error:', error);
      res.status(500).json({ error: 'Failed to verify feature access' });
    }
  };
};

// Middleware to add tier info to request
const attachTierInfo = async (req, res, next) => {
  try {
    if (req.user && req.user.id) {
      req.user.tier = await TierService.getUserTier(req.user.id);
      req.user.billingEnabled = await TierService.isBillingEnabled();
    }
    next();
  } catch (error) {
    console.error('Error attaching tier info:', error);
    // Continue without tier info rather than blocking the request
    next();
  }
};

module.exports = {
  requiresTier,
  requiresFeature,
  attachTierInfo
};