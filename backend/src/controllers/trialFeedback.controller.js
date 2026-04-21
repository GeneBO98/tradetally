const logger = require('../utils/logger');
const TrialFeedbackService = require('../services/trialFeedbackService');
const trialFeedbackTokenService = require('../services/trialFeedbackTokenService');

async function getTrialFeedbackStatus(req, res) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Missing trial feedback token'
      });
    }

    const userId = trialFeedbackTokenService.verifyToken(token);
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired trial feedback link'
      });
    }

    const context = await TrialFeedbackService.getSurveyContext(userId);
    if (!context) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    return res.json({
      success: true,
      data: {
        username: context.username,
        trialExpired: context.trialExpired,
        trialExpiredAt: context.trialExpiredAt,
        hasActiveSubscription: context.hasActiveSubscription,
        options: TrialFeedbackService.getOptions(),
        feedback: context.feedback
      }
    });
  } catch (error) {
    logger.error('[TRIAL_FEEDBACK] Error getting survey status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to load trial feedback survey'
    });
  }
}

async function submitTrialFeedback(req, res) {
  try {
    const { token, primaryReason, feedbackText = null } = req.body || {};

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Missing trial feedback token'
      });
    }

    const userId = trialFeedbackTokenService.verifyToken(token);
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired trial feedback link'
      });
    }

    if (!TrialFeedbackService.isValidReason(primaryReason)) {
      return res.status(400).json({
        success: false,
        error: 'invalid_primary_reason',
        message: 'A valid primary reason is required'
      });
    }

    const feedback = await TrialFeedbackService.submitFeedback(userId, {
      primaryReason,
      feedbackText
    });

    return res.json({
      success: true,
      data: {
        feedback
      }
    });
  } catch (error) {
    logger.error('[TRIAL_FEEDBACK] Error submitting survey response:', error);

    if (error.message === 'User not found' || error.message === 'Trial not found') {
      return res.status(404).json({
        success: false,
        error: error.message
      });
    }

    if (error.message === 'Invalid primary reason') {
      return res.status(400).json({
        success: false,
        error: 'invalid_primary_reason',
        message: 'A valid primary reason is required'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Failed to save trial feedback'
    });
  }
}

module.exports = {
  getTrialFeedbackStatus,
  submitTrialFeedback
};
