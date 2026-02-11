const unsubscribeService = require('../services/unsubscribeService');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * GET /api/unsubscribe?token=xxx
 * Verify token and return user's current marketing consent status
 */
async function getUnsubscribeStatus(req, res) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Missing unsubscribe token'
      });
    }

    const userId = unsubscribeService.verifyToken(token);

    if (!userId) {
      logger.warn('[UNSUBSCRIBE] Invalid token attempted');
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired unsubscribe link'
      });
    }

    const consent = await User.getMarketingConsentById(userId);

    if (consent === null) {
      // User not found
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    return res.json({
      success: true,
      marketing_consent: consent
    });
  } catch (error) {
    logger.error('[UNSUBSCRIBE] Error getting status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to check unsubscribe status'
    });
  }
}

/**
 * POST /api/unsubscribe
 * Process unsubscribe request - supports both web form and RFC 8058 one-click
 */
async function handleUnsubscribe(req, res) {
  try {
    // Token can come from body (web form) or query (RFC 8058 one-click)
    const token = req.body.token || req.query.token;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Missing unsubscribe token'
      });
    }

    const userId = unsubscribeService.verifyToken(token);

    if (!userId) {
      logger.warn('[UNSUBSCRIBE] Invalid token in POST request');
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired unsubscribe link'
      });
    }

    // Update marketing consent to false
    const updated = await User.updateMarketingConsent(userId, false);

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    logger.info(`[UNSUBSCRIBE] User ${userId} unsubscribed from marketing emails`);

    return res.json({
      success: true,
      message: 'Successfully unsubscribed from marketing emails'
    });
  } catch (error) {
    logger.error('[UNSUBSCRIBE] Error processing unsubscribe:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process unsubscribe request'
    });
  }
}

module.exports = {
  getUnsubscribeStatus,
  handleUnsubscribe
};
