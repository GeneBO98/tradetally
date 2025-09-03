const express = require('express');
const router = express.Router();
const gamificationController = require('../controllers/gamification.controller');
const { authenticate } = require('../middleware/auth');
const { attachTierInfo, requiresTier } = require('../middleware/tierAuth');

// Apply authentication to all routes
router.use(authenticate);
router.use(attachTierInfo);
// Note: Gamification features are available to all users
// Leaderboards use anonymous usernames for privacy protection

// Achievement routes
router.get('/achievements', gamificationController.getAvailableAchievements);
router.get('/achievements/earned', gamificationController.getUserAchievements);
router.post('/achievements/check', gamificationController.checkAchievements);

// Challenge routes
router.get('/challenges', gamificationController.getUserChallenges);
router.get('/challenges/active', gamificationController.getActiveChallenges);
router.post('/challenges/:challengeId/join', gamificationController.joinChallenge);
router.get('/challenges/:challengeId/leaderboard', gamificationController.getChallengeLeaderboard);

// Leaderboard routes
router.get('/leaderboards', gamificationController.getAllLeaderboards);
router.get('/leaderboards/:key', gamificationController.getLeaderboard);
router.get('/rankings', gamificationController.getUserRankings);
router.get('/rankings/filters', gamificationController.getRankingFilters);

// Privacy settings
router.get('/privacy', gamificationController.getPrivacySettings);
router.put('/privacy', gamificationController.updatePrivacySettings);

// Dashboard and comparison
router.get('/dashboard', gamificationController.getDashboard);
router.get('/peer-comparison', gamificationController.getPeerComparison);

// Admin routes
router.post('/challenges', gamificationController.createChallenge);
router.post('/leaderboards/update', gamificationController.updateLeaderboards);

// Debug/sync route
router.post('/sync-stats', gamificationController.syncUserStats);

module.exports = router;