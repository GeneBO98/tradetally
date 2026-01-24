const AISessionService = require('../services/aiSessionService');
const AICreditService = require('../services/aiCreditService');

/**
 * AI Controller
 * Handles AI conversation sessions and credit management endpoints
 */
const aiController = {
  /**
   * Create a new AI analysis session
   * POST /api/ai/sessions
   * Body: { filters?: object }
   * Returns: { session_id, initial_analysis, credits_used, credits_remaining }
   */
  async createSession(req, res, next) {
    try {
      console.log('[AI_CONTROLLER] Creating new session for user', req.user.id);

      const { filters } = req.body || {};

      const result = await AISessionService.createSession(
        req.user.id,
        filters,
        {
          apiKey: req.body.apiKey,
          modelName: req.body.modelName
        }
      );

      res.status(201).json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error creating session:', error.message);

      // Handle specific error types
      if (error.message.includes('Insufficient credits')) {
        return res.status(402).json({
          success: false,
          error: 'Insufficient credits',
          message: error.message
        });
      }

      if (error.message.includes('require a Pro subscription')) {
        return res.status(403).json({
          success: false,
          error: 'Pro subscription required',
          message: error.message
        });
      }

      if (error.message.includes('API key')) {
        return res.status(500).json({
          success: false,
          error: 'AI configuration error',
          message: error.message
        });
      }

      next(error);
    }
  },

  /**
   * Send a follow-up question in an existing session
   * POST /api/ai/sessions/:id/followup
   * Body: { message: string }
   * Returns: { response, followup_count, max_followups, credits_used, credits_remaining }
   */
  async sendFollowup(req, res, next) {
    try {
      const { id: sessionId } = req.params;
      const { message } = req.body;

      if (!message || message.trim() === '') {
        return res.status(400).json({
          success: false,
          error: 'Message required',
          message: 'Please provide a follow-up question'
        });
      }

      console.log('[AI_CONTROLLER] Processing follow-up for session', sessionId);

      const result = await AISessionService.sendFollowup(
        sessionId,
        req.user.id,
        message.trim(),
        {
          apiKey: req.body.apiKey,
          modelName: req.body.modelName
        }
      );

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error processing follow-up:', error.message);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
          message: error.message
        });
      }

      if (error.message.includes('expired')) {
        return res.status(410).json({
          success: false,
          error: 'Session expired',
          message: error.message
        });
      }

      if (error.message.includes('Maximum follow-up')) {
        return res.status(429).json({
          success: false,
          error: 'Follow-up limit reached',
          message: error.message
        });
      }

      if (error.message.includes('Insufficient credits')) {
        return res.status(402).json({
          success: false,
          error: 'Insufficient credits',
          message: error.message
        });
      }

      next(error);
    }
  },

  /**
   * Get session details with message history
   * GET /api/ai/sessions/:id
   * Returns: { session, messages }
   */
  async getSession(req, res, next) {
    try {
      const { id: sessionId } = req.params;

      const session = await AISessionService.getSession(sessionId, req.user.id);

      res.json({
        success: true,
        session
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error getting session:', error.message);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
          message: error.message
        });
      }

      next(error);
    }
  },

  /**
   * Get user's recent sessions
   * GET /api/ai/sessions
   * Query: { limit?: number }
   * Returns: { sessions: array }
   */
  async getUserSessions(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 10;

      const sessions = await AISessionService.getUserSessions(req.user.id, Math.min(limit, 50));

      res.json({
        success: true,
        sessions
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error getting user sessions:', error.message);
      next(error);
    }
  },

  /**
   * Close a session
   * POST /api/ai/sessions/:id/close
   * Returns: { success: boolean }
   */
  async closeSession(req, res, next) {
    try {
      const { id: sessionId } = req.params;

      // Verify ownership first
      await AISessionService.getSession(sessionId, req.user.id);

      await AISessionService.closeSession(sessionId, 'closed');

      res.json({
        success: true,
        message: 'Session closed'
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error closing session:', error.message);

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
          message: error.message
        });
      }

      next(error);
    }
  },

  /**
   * Get user's credit balance
   * GET /api/ai/credits
   * Returns: { allocated, used, remaining, period_end }
   */
  async getCredits(req, res, next) {
    try {
      const credits = await AICreditService.getCredits(req.user.id);

      res.json({
        success: true,
        credits: {
          allocated: credits.allocated,
          used: credits.used,
          remaining: credits.remaining,
          period_start: credits.period_start,
          period_end: credits.period_end,
          unlimited: credits.unlimited || false
        },
        costs: {
          new_session: AICreditService.getCost('NEW_SESSION'),
          followup: AICreditService.getCost('FOLLOWUP')
        }
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error getting credits:', error.message);
      next(error);
    }
  },

  /**
   * Get credit usage history
   * GET /api/ai/credits/history
   * Query: { limit?: number }
   * Returns: { history: array }
   */
  async getCreditHistory(req, res, next) {
    try {
      const limit = parseInt(req.query.limit) || 6;

      const history = await AICreditService.getCreditHistory(req.user.id, Math.min(limit, 12));

      res.json({
        success: true,
        history
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error getting credit history:', error.message);
      next(error);
    }
  }
};

module.exports = aiController;
