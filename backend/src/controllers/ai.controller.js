const AISessionService = require('../services/aiSessionService');
const AICreditService = require('../services/aiCreditService');
const AITraderContext = require('../services/aiTraderContext');
const { sendAIUnavailable } = require('../utils/aiErrorResponse');

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

      const { filters, tradeId, analysisType, request_id } = req.body || {};

      const result = await AISessionService.createSession(
        req.user.id,
        filters,
        {
          apiKey: req.body.apiKey,
          modelName: req.body.modelName,
          tradeId,
          analysisType,
          request_id
        }
      );

      res.status(201).json({
        success: true,
        ...result
      });
    } catch (error) {
      if (error.code === 'AI_IMAGE_INPUT_REJECTED') return res.status(400).json({ error: error.code, message: error.message });
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

      if (error.message.includes('Trade ID is required')) {
        return res.status(400).json({
          success: false,
          error: 'Trade ID required',
          message: error.message
        });
      }

      if (error.message.includes('Trade not found')) {
        return res.status(404).json({
          success: false,
          error: 'Trade not found',
          message: error.message
        });
      }

      return sendAIUnavailable(res);
    }
  },

  /**
   * Start a free-form AI chat with journal-wide context
   * POST /api/ai/chat
   * Body: { message: string, request_id?: string }
   * Returns: { session_id, title, response, credits_used, credits_remaining }
   */
  /**
   * Save a memory note the assistant proposed (or the user typed) so every
   * future AI prompt carries it. Notes are managed in Profile > Trading Profile.
   * POST /api/ai/memory-notes { note }
   */
  async addMemoryNote(req, res, next) {
    try {
      const User = require('../models/User');
      const note = String(req.body.note || '').replace(/\s+/g, ' ').trim();
      if (note.length < 3) {
        return res.status(400).json({ success: false, error: 'Note is too short' });
      }
      if (note.length > AITraderContext.MAX_MEMORY_NOTE_CHARS) {
        return res.status(400).json({ success: false, error: `Note must be at most ${AITraderContext.MAX_MEMORY_NOTE_CHARS} characters` });
      }

      const settings = await User.getSettings(req.user.id);
      const existing = Array.isArray(settings?.ai_memory_notes) ? settings.ai_memory_notes.filter(n => typeof n === 'string') : [];
      if (existing.some(n => n.toLowerCase() === note.toLowerCase())) {
        return res.json({ success: true, notes: existing, added: false });
      }
      if (existing.length >= AITraderContext.MAX_MEMORY_NOTES) {
        return res.status(400).json({
          success: false,
          error: `You already have ${AITraderContext.MAX_MEMORY_NOTES} memory notes. Remove one in Profile > Trading Profile first.`
        });
      }

      const notes = [...existing, note];
      await User.updateSettings(req.user.id, { aiMemoryNotes: notes });
      AITraderContext.invalidate(req.user.id);
      res.status(201).json({ success: true, notes, added: true });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error saving memory note:', error.message);
      next(error);
    }
  },

  async createChat(req, res, next) {
    try {
      console.log('[AI_CONTROLLER] Creating chat session for user', req.user.id);

      const result = await AISessionService.createChatSession(
        req.user.id,
        req.body.message.trim(),
        {
          apiKey: req.body.apiKey,
          modelName: req.body.modelName,
          request_id: req.body.request_id
        }
      );

      res.status(201).json({
        success: true,
        ...result
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error creating chat session:', error.message);

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

      if (error.code === 'AI_FOLLOWUP_NOT_TRADING_RELATED') {
        return res.status(400).json({
          success: false,
          error: 'Question must be trading-related',
          message: error.message
        });
      }

      return sendAIUnavailable(res);
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

      if (!message || (typeof message !== 'string') || message.trim() === '') {
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
      if (error.code === 'AI_IMAGE_INPUT_REJECTED') return res.status(400).json({ error: error.code, message: error.message });
      console.error('[AI_CONTROLLER] Error processing follow-up:', error.message);

      if (error.message === 'Session not found or access denied') {
        return res.status(404).json({
          success: false,
          error: 'Session not found',
          message: error.message
        });
      }

      if (error.message === 'Session has expired. Please start a new session.') {
        return res.status(410).json({
          success: false,
          error: 'Session expired',
          message: error.message
        });
      }

      if (/^Session is (closed|expired)\. Please start a new session\.$/.test(error.message)) {
        return res.status(410).json({ success: false, error: 'Session closed', message: error.message });
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

      if (error.code === 'AI_FOLLOWUP_NOT_TRADING_RELATED') {
        return res.status(400).json({
          success: false,
          error: 'Question must be trading-related',
          message: error.message
        });
      }

      return sendAIUnavailable(res);
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

      const type = ['chat', 'single_trade', 'performance'].includes(req.query.type) ? req.query.type : undefined;

      const sessions = await AISessionService.getUserSessions(req.user.id, Math.min(limit, 50), { type });

      res.json({
        success: true,
        sessions
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error getting user sessions:', error.message);
      next(error);
    }
  },

  async getTradeAnalyses(req, res, next) {
    try {
      const { tradeId } = req.params;
      const limit = parseInt(req.query.limit, 10) || 10;

      const analyses = await AISessionService.getTradeAnalyses(req.user.id, tradeId, limit);
      const responseCount = analyses.reduce((sum, analysis) => sum + (analysis.response_count || 0), 0);

      res.json({
        success: true,
        tradeId,
        count: analyses.length,
        response_count: responseCount,
        analyses
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error getting trade analyses:', error.message);

      if (error.message.includes('Trade ID is required')) {
        return res.status(400).json({
          success: false,
          error: 'Trade ID required',
          message: error.message
        });
      }

      if (error.message.includes('Trade not found')) {
        return res.status(404).json({
          success: false,
          error: 'Trade not found',
          message: error.message
        });
      }

      next(error);
    }
  },

  async deleteTradeAnalysis(req, res, next) {
    try {
      const { tradeId, analysisId } = req.params;
      const deletedCount = await AISessionService.deleteTradeAnalysis(req.user.id, tradeId, analysisId);

      res.json({
        success: true,
        deleted_count: deletedCount
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error deleting trade analysis:', error.message);

      if (error.message.includes('Trade ID is required') || error.message.includes('Analysis ID is required')) {
        return res.status(400).json({
          success: false,
          error: 'Invalid request',
          message: error.message
        });
      }

      if (error.message.includes('not found') || error.message.includes('access denied')) {
        return res.status(404).json({
          success: false,
          error: 'Analysis not found',
          message: error.message
        });
      }

      next(error);
    }
  },

  async deleteTradeAnalyses(req, res, next) {
    try {
      const { tradeId } = req.params;
      const deletedCount = await AISessionService.deleteTradeAnalyses(req.user.id, tradeId);

      res.json({
        success: true,
        deleted_count: deletedCount
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error clearing trade analyses:', error.message);

      if (error.message.includes('Trade ID is required')) {
        return res.status(400).json({
          success: false,
          error: 'Trade ID required',
          message: error.message
        });
      }

      next(error);
    }
  },

  /**
   * Delete a session and its messages
   * DELETE /api/ai/sessions/:id
   */
  async deleteSession(req, res, next) {
    try {
      const deletedCount = await AISessionService.deleteSession(req.user.id, req.params.id);

      res.json({
        success: true,
        deleted_count: deletedCount
      });
    } catch (error) {
      console.error('[AI_CONTROLLER] Error deleting session:', error.message);

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

      // A Pro user running AI on their own provider/key is not charged
      // credits, so report unlimited for gating and display.
      let ownProvider = false;
      if (!credits.unlimited && !credits.tier_restricted) {
        try {
          ownProvider = (await AISessionService.getAISettings(req.user.id)).user_funded === true;
        } catch (settingsError) {
          ownProvider = false; // no usable provider configured
        }
      }

      res.json({
        success: true,
        credits: {
          allocated: credits.allocated,
          used: credits.used,
          remaining: credits.remaining,
          period_start: credits.period_start,
          period_end: credits.period_end,
          unlimited: credits.unlimited || ownProvider,
          own_provider: ownProvider
        },
        costs: {
          new_session: AICreditService.getCost('NEW_SESSION'),
          followup: AICreditService.getCost('FOLLOWUP'),
          chat_message: AICreditService.getCost('CHAT_MESSAGE')
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
