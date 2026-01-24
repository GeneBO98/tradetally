const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');
const { authenticate } = require('../middleware/auth');

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
router.post('/sessions', authenticate, aiController.createSession);

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
 *     responses:
 *       200:
 *         description: Sessions retrieved successfully
 */
router.get('/sessions', authenticate, aiController.getUserSessions);

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
 * /api/ai/sessions/{id}/followup:
 *   post:
 *     summary: Send a follow-up question in an existing session
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
router.post('/sessions/:id/followup', authenticate, aiController.sendFollowup);

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
router.post('/sessions/:id/close', authenticate, aiController.closeSession);

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

module.exports = router;
