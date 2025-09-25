const express = require('express');
const router = express.Router();
const notificationPreferencesController = require('../controllers/notificationPreferences.controller');
const { authenticate } = require('../middleware/auth');

/**
 * @swagger
 * tags:
 *   name: Notification Preferences
 *   description: User notification preference management
 */

/**
 * @swagger
 * /api/notification-preferences:
 *   get:
 *     summary: Get user's notification preferences
 *     tags: [Notification Preferences]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User notification preferences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notify_news_open_positions:
 *                   type: boolean
 *                   description: Notifications for news on open positions
 *                 notify_earnings_announcements:
 *                   type: boolean
 *                   description: Notifications for earnings announcements
 *                 notify_price_alerts:
 *                   type: boolean
 *                   description: Notifications for price alerts
 *                 notify_trade_reminders:
 *                   type: boolean
 *                   description: Notifications for trade reminders
 *                 notify_market_events:
 *                   type: boolean
 *                   description: Notifications for market events
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/', authenticate, notificationPreferencesController.getPreferences);

/**
 * @swagger
 * /api/notification-preferences:
 *   put:
 *     summary: Update user's notification preferences
 *     tags: [Notification Preferences]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notify_news_open_positions:
 *                 type: boolean
 *                 description: Notifications for news on open positions
 *               notify_earnings_announcements:
 *                 type: boolean
 *                 description: Notifications for earnings announcements
 *               notify_price_alerts:
 *                 type: boolean
 *                 description: Notifications for price alerts
 *               notify_trade_reminders:
 *                 type: boolean
 *                 description: Notifications for trade reminders
 *               notify_market_events:
 *                 type: boolean
 *                 description: Notifications for market events
 *             example:
 *               notify_news_open_positions: true
 *               notify_earnings_announcements: true
 *               notify_price_alerts: false
 *     responses:
 *       200:
 *         description: Preferences updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 preferences:
 *                   type: object
 *       400:
 *         description: Invalid request data
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.put('/', authenticate, notificationPreferencesController.updatePreferences);

/**
 * @swagger
 * /api/notification-preferences/definitions:
 *   get:
 *     summary: Get notification preference definitions and descriptions
 *     tags: [Notification Preferences]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notification preference definitions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     description: Human-readable label
 *                   description:
 *                     type: string
 *                     description: Detailed description
 *                   category:
 *                     type: string
 *                     description: Preference category
 *       500:
 *         description: Server error
 */
router.get('/definitions', authenticate, notificationPreferencesController.getPreferenceDefinitions);

/**
 * @swagger
 * /api/notification-preferences/check/{preference}:
 *   get:
 *     summary: Check if specific notification preference is enabled
 *     tags: [Notification Preferences]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: preference
 *         required: true
 *         schema:
 *           type: string
 *           enum: [notify_news_open_positions, notify_earnings_announcements, notify_price_alerts, notify_trade_reminders, notify_market_events]
 *         description: Preference type to check
 *     responses:
 *       200:
 *         description: Preference status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 preference:
 *                   type: string
 *                 enabled:
 *                   type: boolean
 *       400:
 *         description: Invalid preference type
 *       404:
 *         description: User not found
 *       500:
 *         description: Server error
 */
router.get('/check/:preference', authenticate, notificationPreferencesController.checkPreference);

module.exports = router;