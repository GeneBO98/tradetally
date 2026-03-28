const EmailService = require('../services/emailService');
const db = require('../config/database');

const supportController = {
  async submitContactRequest(req, res, next) {
    try {
      const userId = req.user.id;
      const { subject, message } = req.body;

      if (!subject || !message) {
        return res.status(400).json({
          error: 'missing_fields',
          message: 'Subject and message are required'
        });
      }

      if (subject.length > 200) {
        return res.status(400).json({
          error: 'invalid_input',
          message: 'Subject must be 200 characters or less'
        });
      }

      if (message.length > 5000) {
        return res.status(400).json({
          error: 'invalid_input',
          message: 'Message must be 5000 characters or less'
        });
      }

      // Get user details
      const userResult = await db.query(
        'SELECT email, username, tier FROM users WHERE id = $1',
        [userId]
      );

      if (!userResult.rows[0]) {
        return res.status(404).json({
          error: 'user_not_found',
          message: 'User not found'
        });
      }

      const user = userResult.rows[0];
      const tier = (user.tier || 'free').charAt(0).toUpperCase() + (user.tier || 'free').slice(1);

      // Get admin/owner email as recipient
      const adminResult = await db.query(
        `SELECT email FROM users WHERE role IN ('admin', 'owner') ORDER BY created_at ASC LIMIT 1`
      );

      const recipientEmail = process.env.SUPPORT_EMAIL
        || (adminResult.rows[0] && adminResult.rows[0].email)
        || process.env.EMAIL_FROM;

      if (!recipientEmail) {
        console.error('[ERROR] No support email recipient configured');
        return res.status(500).json({
          error: 'configuration_error',
          message: 'Support email is not configured. Please contact the administrator.'
        });
      }

      // Check email service is available
      if (!EmailService.isConfigured()) {
        console.error('[ERROR] Email service not configured');
        return res.status(500).json({
          error: 'configuration_error',
          message: 'Email service is not configured. Please contact the administrator.'
        });
      }

      await EmailService.sendSupportRequest({
        to: recipientEmail,
        userEmail: user.email,
        username: user.username,
        tier: tier,
        subject: subject,
        message: message
      });

      console.log('[SUPPORT] Support request sent from', user.email, '- Subject:', subject);

      res.json({
        success: true,
        message: 'Support request sent successfully'
      });
    } catch (error) {
      console.error('[ERROR] Failed to send support request:', error);
      next(error);
    }
  }
};

module.exports = supportController;
