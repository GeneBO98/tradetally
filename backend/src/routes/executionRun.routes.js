const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const executionRunController = require('../controllers/executionRun.controller');

/**
 * @swagger
 * components:
 *   schemas:
 *     ExecutionRun:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         userId:
 *           type: string
 *           format: uuid
 *         mode:
 *           type: string
 *           enum: [live, replay, backtest]
 *         name:
 *           type: string
 *         status:
 *           type: string
 *           enum: [created, running, paused, completed, failed, cancelled]
 *         source:
 *           type: string
 *         config:
 *           type: object
 *         metrics:
 *           type: object
 *         startedAt:
 *           type: string
 *           format: date-time
 *         endedAt:
 *           type: string
 *           format: date-time
 *         errorMessage:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     ExecutionRunEvent:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         runId:
 *           type: string
 *           format: uuid
 *         eventType:
 *           type: string
 *         payload:
 *           type: object
 *         createdAt:
 *           type: string
 *           format: date-time
 */
router.get('/shared/:token', executionRunController.getShared);
router.use(authenticate);

/**
 * @swagger
 * /api/execution-runs:
 *   get:
 *     summary: List execution runs for live, replay, and backtest workflows
 *     tags: [Execution Runs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: mode
 *         schema:
 *           type: string
 *           enum: [live, replay, backtest]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [created, running, paused, completed, failed, cancelled]
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 200
 *     responses:
 *       200:
 *         description: Execution runs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 runs:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ExecutionRun'
 *   post:
 *     summary: Create an execution run
 *     tags: [Execution Runs]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [mode]
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [live, replay, backtest]
 *               name:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [created, running, paused, completed, failed, cancelled]
 *               source:
 *                 type: string
 *               config:
 *                 type: object
 *               metrics:
 *                 type: object
 *               startedAt:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Created execution run
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 run:
 *                   $ref: '#/components/schemas/ExecutionRun'
 */
router.get('/', executionRunController.list);
router.post('/', executionRunController.create);
router.get('/compare', executionRunController.compare);

/**
 * @swagger
 * /api/execution-runs/{id}:
 *   get:
 *     summary: Get an execution run
 *     tags: [Execution Runs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Execution run
 *   patch:
 *     summary: Update an execution run lifecycle, config, or metrics
 *     tags: [Execution Runs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [created, running, paused, completed, failed, cancelled]
 *               metrics:
 *                 type: object
 *               endedAt:
 *                 type: string
 *                 format: date-time
 *               errorMessage:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated execution run
 */
router.get('/:id', executionRunController.get);
router.patch('/:id', executionRunController.update);
router.get('/:id/report', executionRunController.getReport);
router.post('/:id/share', executionRunController.share);
router.post('/:id/share/rotate', executionRunController.share);
router.get('/:id/share/accounts', executionRunController.listShareScopeAccounts);
router.get('/:id/share/audits', executionRunController.listShareAudits);
router.delete('/:id/share', executionRunController.unshare);

/**
 * @swagger
 * /api/execution-runs/{id}/events:
 *   get:
 *     summary: List structured audit events for an execution run
 *     tags: [Execution Runs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Execution run events
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 events:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ExecutionRunEvent'
 *   post:
 *     summary: Append a structured audit event to an execution run
 *     tags: [Execution Runs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventType]
 *             properties:
 *               eventType:
 *                 type: string
 *                 example: analysis.filters_changed
 *               payload:
 *                 type: object
 *     responses:
 *       201:
 *         description: Created execution run event
 */
router.get('/:id/events', executionRunController.listEvents);
router.post('/:id/events', executionRunController.appendEvent);

module.exports = router;
