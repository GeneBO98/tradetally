const express = require('express');
const controller = require('../controllers/aggregateAnalytics.controller');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { attachTierInfo, requiresTier } = require('../middleware/tierAuth');

// ---- Admin routes ----
const adminRouter = express.Router();
adminRouter.use(requireAdmin);

adminRouter.get('/', controller.getAdminAll);
adminRouter.get('/symbols', controller.getAdminSymbols);
adminRouter.get('/time-analysis', controller.getAdminTimeAnalysis);
adminRouter.get('/strategies', controller.getAdminStrategies);
adminRouter.get('/behavioral', controller.getAdminBehavioral);
adminRouter.get('/hold-time', controller.getAdminHoldTime);
adminRouter.get('/consecutive-loss', controller.getAdminConsecutiveLoss);
adminRouter.get('/sentiment', controller.getAdminSentiment);
adminRouter.get('/most-traded-today', controller.getAdminMostTradedToday);
adminRouter.get('/revenge-cost', controller.getAdminRevengeCost);

// ---- Pro user routes ----
const communityRouter = express.Router();
communityRouter.use(authenticate);
communityRouter.use(attachTierInfo);
communityRouter.use(requiresTier('pro'));

communityRouter.get('/', controller.getCommunityAll);
communityRouter.get('/symbols', controller.getCommunitySymbols);
communityRouter.get('/time-analysis', controller.getCommunityTimeAnalysis);
communityRouter.get('/strategies', controller.getCommunityStrategies);
communityRouter.get('/behavioral', controller.getCommunityBehavioral);
communityRouter.get('/hold-time', controller.getCommunityHoldTime);
communityRouter.get('/consecutive-loss', controller.getCommunityConsecutiveLoss);
communityRouter.get('/sentiment', controller.getCommunitySentiment);
communityRouter.get('/most-traded-today', controller.getCommunityMostTradedToday);
communityRouter.get('/revenge-cost', controller.getCommunityRevengeCost);
communityRouter.get('/ai-summary', controller.getAISummary);
communityRouter.get('/percentile', controller.getPercentile);

// ---- Public routes (no auth) ----
const publicRouter = express.Router();
publicRouter.get('/pulse', controller.getPublicPulse);

module.exports = { adminRouter, communityRouter, publicRouter };
