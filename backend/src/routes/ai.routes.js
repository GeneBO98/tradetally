const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');
const { authenticate } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validation');
const { createRateLimiter } = require('../utils/rateLimit');

const aiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many AI requests. Please slow down and try again later.'
});

/**
 * AI Routes
 * Endpoints for AI conversation sessions and credit management
 *
 * All routes require authentication.
 * Credit checks are handled in the service layer.
 */

/**
 * @swagger
 * /api/ai/sessions:
 *   post:
 *     summary: Create a new AI analysis session
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               filters:
 *                 type: object
 *                 description: Optional filters to apply to trade analysis
 *     responses:
 *       201:
 *         description: Session created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 session_id:
 *                   type: string
 *                 initial_analysis:
 *                   type: string
 *                 credits_used:
 *                   type: integer
 *                 credits_remaining:
 *                   type: integer
 *       402:
 *         description: Insufficient credits
 *       403:
 *         description: Pro subscription required
 */
router.post('/sessions', authenticate, aiLimiter, validate(schemas.aiCreateSession), aiController.createSession);

/**
 * @swagger
 * /api/ai/chat:
 *   post:
 *     summary: Start a free-form AI chat that uses the user's whole journal as context
 *     description: |
 *       Each message is answered with a fresh snapshot of the user's performance, open positions,
 *       per-symbol and per-strategy stats, recent trades, and journal entries. Ticker symbols
 *       mentioned in the message add the user's history on that symbol plus live quote, news,
 *       and earnings data when market data is configured. Continue the chat with
 *       POST /api/ai/sessions/{id}/followup.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *               request_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Chat session created with the first reply
 *       400:
 *         description: Message missing or not trading-related
 *       402:
 *         description: Insufficient credits
 *       403:
 *         description: Pro subscription required
 */
router.post('/chat', authenticate, aiLimiter, validate(schemas.aiCreateChat), aiController.createChat);

/**
 * @swagger
 * /api/ai/sessions:
 *   get:
 *     summary: Get user's recent AI sessions
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [chat, single_trade, performance]
 *     responses:
 *       200:
 *         description: Sessions retrieved successfully
 */
router.get('/sessions', authenticate, aiController.getUserSessions);

/**
 * Get stored AI analyses for a specific trade.
 */
router.get('/trades/:tradeId/analyses', authenticate, aiController.getTradeAnalyses);
router.delete('/trades/:tradeId/analyses/:analysisId', authenticate, aiController.deleteTradeAnalysis);
router.delete('/trades/:tradeId/analyses', authenticate, aiController.deleteTradeAnalyses);

/**
 * @swagger
 * /api/ai/sessions/{id}:
 *   get:
 *     summary: Get session details with message history
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session retrieved successfully
 *       404:
 *         description: Session not found
 */
router.get('/sessions/:id', authenticate, aiController.getSession);

/**
 * @swagger
 * /api/ai/sessions/{id}:
 *   delete:
 *     summary: Delete an AI session and its messages
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session deleted
 *       404:
 *         description: Session not found
 */
router.delete('/sessions/:id', authenticate, aiController.deleteSession);

/**
 * @swagger
 * /api/ai/sessions/{id}/followup:
 *   post:
 *     summary: Send a follow-up question in an existing session
 *     description: Closed or expired sessions are reopened, so older analyses and chats can be continued.
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The follow-up question
 *     responses:
 *       200:
 *         description: Response generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 response:
 *                   type: string
 *                 followup_count:
 *                   type: integer
 *                 max_followups:
 *                   type: integer
 *                 credits_used:
 *                   type: integer
 *                 credits_remaining:
 *                   type: integer
 *       400:
 *         description: Message required
 *       402:
 *         description: Insufficient credits
 *       404:
 *         description: Session not found
 *       410:
 *         description: Session expired
 *       429:
 *         description: Follow-up limit reached
 */
router.post('/sessions/:id/followup', authenticate, aiLimiter, validate(schemas.aiFollowup), aiController.sendFollowup);

/**
 * @swagger
 * /api/ai/sessions/{id}/close:
 *   post:
 *     summary: Close an AI session
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session closed successfully
 *       404:
 *         description: Session not found
 */
router.post('/sessions/:id/close', authenticate, aiLimiter, aiController.closeSession);

/**
 * @swagger
 * /api/ai/credits:
 *   get:
 *     summary: Get user's AI credit balance
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Credits retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 credits:
 *                   type: object
 *                   properties:
 *                     allocated:
 *                       type: integer
 *                       nullable: true
 *                       description: null if unlimited (self-hosted)
 *                     used:
 *                       type: integer
 *                     remaining:
 *                       type: integer
 *                       nullable: true
 *                     period_end:
 *                       type: string
 *                       format: date
 *                     unlimited:
 *                       type: boolean
 *                 costs:
 *                   type: object
 *                   properties:
 *                     new_session:
 *                       type: integer
 *                     followup:
 *                       type: integer
 */
router.get('/credits', authenticate, aiController.getCredits);

/**
 * @swagger
 * /api/ai/credits/history:
 *   get:
 *     summary: Get user's credit usage history
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 6
 *     responses:
 *       200:
 *         description: Credit history retrieved successfully
 */
router.get('/credits/history', authenticate, aiController.getCreditHistory);

/**
 * @swagger
 * /api/ai/memory-notes:
 *   post:
 *     summary: Save a memory note that every AI prompt will carry
 *     tags: [AI]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [note]
 *             properties:
 *               note:
 *                 type: string
 *                 maxLength: 300
 *     responses:
 *       201:
 *         description: Note saved; returns the full list of notes
 */
router.post('/memory-notes', authenticate, validate(schemas.aiMemoryNote), aiController.addMemoryNote);

module.exports = router;
