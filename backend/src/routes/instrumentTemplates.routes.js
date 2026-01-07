const express = require('express');
const router = express.Router();
const instrumentTemplatesController = require('../controllers/instrumentTemplates.controller');
const { authenticate } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Instrument Templates
 *   description: Reusable templates for futures and options contract details
 */

/**
 * @swagger
 * /api/instrument-templates:
 *   get:
 *     summary: Get all instrument templates for the authenticated user
 *     tags: [Instrument Templates]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: instrument_type
 *         schema:
 *           type: string
 *           enum: [future, option]
 *         description: Filter by instrument type
 *     responses:
 *       200:
 *         description: List of instrument templates
 *       401:
 *         description: Unauthorized
 */
router.get('/', authenticate, instrumentTemplatesController.getAllTemplates);

/**
 * @swagger
 * /api/instrument-templates/{id}:
 *   get:
 *     summary: Get a single instrument template by ID
 *     tags: [Instrument Templates]
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
 *         description: Instrument template details
 *       404:
 *         description: Template not found
 */
router.get('/:id', authenticate, instrumentTemplatesController.getTemplate);

/**
 * @swagger
 * /api/instrument-templates:
 *   post:
 *     summary: Create a new instrument template
 *     tags: [Instrument Templates]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - instrument_type
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               instrument_type:
 *                 type: string
 *                 enum: [future, option]
 *               symbol:
 *                 type: string
 *               underlying_symbol:
 *                 type: string
 *               contract_size:
 *                 type: integer
 *               underlying_asset:
 *                 type: string
 *               tick_size:
 *                 type: number
 *               point_value:
 *                 type: number
 *     responses:
 *       201:
 *         description: Template created successfully
 *       400:
 *         description: Invalid input
 *       409:
 *         description: Template with this name already exists
 */
router.post('/', authenticate, instrumentTemplatesController.createTemplate);

/**
 * @swagger
 * /api/instrument-templates/{id}:
 *   put:
 *     summary: Update an instrument template
 *     tags: [Instrument Templates]
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
 *         description: Template updated successfully
 *       404:
 *         description: Template not found
 */
router.put('/:id', authenticate, instrumentTemplatesController.updateTemplate);

/**
 * @swagger
 * /api/instrument-templates/{id}:
 *   delete:
 *     summary: Delete an instrument template
 *     tags: [Instrument Templates]
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
 *         description: Template deleted successfully
 *       404:
 *         description: Template not found
 */
router.delete('/:id', authenticate, instrumentTemplatesController.deleteTemplate);

module.exports = router;
